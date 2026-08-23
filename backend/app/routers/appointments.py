import json
from datetime import datetime, timedelta, time as dtime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_role
from ..services import llm_service, email_service, calendar_service

router = APIRouter(prefix="/api/appointments", tags=["appointments"])

HOLD_DURATION_MINUTES = 10


def _appt_out(appt: models.Appointment) -> schemas.AppointmentOut:
    return schemas.AppointmentOut(
        id=appt.id, doctor_id=appt.doctor_id, doctor_name=appt.doctor.user.full_name,
        specialization=appt.doctor.specialization, patient_id=appt.patient_id,
        patient_name=appt.patient.full_name, slot_start=appt.slot_start, slot_end=appt.slot_end,
        status=appt.status.value,
    )


@router.post("/hold", response_model=schemas.HoldSlotResponse)
def hold_slot(payload: schemas.HoldSlotRequest, db: Session = Depends(get_db),
              patient=Depends(require_role("patient"))):
    """
    Places a short-lived hold on a slot so the patient can fill the symptom
    form without racing another patient for the same slot. The DB-level
    unique constraint on (doctor_id, slot_start) in slot_locks is what makes
    this safe under concurrent requests - see SYSTEM_DESIGN.md.
    """
    profile = db.query(models.DoctorProfile).get(payload.doctor_id)
    if not profile or not profile.active:
        raise HTTPException(status_code=404, detail="Doctor not found")

    on_leave = db.query(models.Leave).filter(
        models.Leave.doctor_id == payload.doctor_id,
        models.Leave.date == payload.slot_start.date(),
    ).first()
    if on_leave:
        raise HTTPException(status_code=409, detail="Doctor is on leave that day")

    weekday = payload.slot_start.weekday()
    slot_time = payload.slot_start.time()
    duration = timedelta(minutes=profile.slot_duration_minutes)
    slot_end_time = (payload.slot_start + duration).time()

    working_hours = db.query(models.WorkingHours).filter(
        models.WorkingHours.doctor_id == payload.doctor_id,
        models.WorkingHours.weekday == weekday,
    ).all()
    fits_within_hours = any(
        wh.start_time <= slot_time and slot_end_time <= wh.end_time
        for wh in working_hours
    )
    if not fits_within_hours:
        raise HTTPException(status_code=400, detail="Requested time is outside working hours")

    appt = models.Appointment(
        patient_id=patient.id,
        doctor_id=payload.doctor_id,
        slot_start=payload.slot_start,
        slot_end=payload.slot_start + duration,
        status=models.AppointmentStatus.held,
        hold_expires_at=datetime.utcnow() + timedelta(minutes=HOLD_DURATION_MINUTES),
    )
    db.add(appt)
    try:
        db.flush()  # assign appt.id without committing yet
        lock = models.SlotLock(doctor_id=payload.doctor_id, slot_start=payload.slot_start, appointment_id=appt.id)
        db.add(lock)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This slot was just taken by another patient. Please pick another.")

    db.refresh(appt)
    return schemas.HoldSlotResponse(appointment_id=appt.id, hold_expires_at=appt.hold_expires_at)


@router.post("/{appointment_id}/symptoms")
def submit_symptoms(appointment_id: int, payload: schemas.SymptomFormIn, db: Session = Depends(get_db),
                     patient=Depends(require_role("patient"))):
    appt = db.query(models.Appointment).get(appointment_id)
    if not appt or appt.patient_id != patient.id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status != models.AppointmentStatus.held:
        raise HTTPException(status_code=400, detail="This appointment is no longer held for you")
    if appt.hold_expires_at and appt.hold_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Your slot hold expired. Please pick a slot again.")

    existing = db.query(models.SymptomForm).filter(models.SymptomForm.appointment_id == appointment_id).first()
    if existing:
        existing.symptoms_text = payload.symptoms_text
        existing.submitted_at = datetime.utcnow()
    else:
        db.add(models.SymptomForm(appointment_id=appointment_id, symptoms_text=payload.symptoms_text))
    db.commit()
    return {"ok": True}


@router.post("/{appointment_id}/confirm", response_model=schemas.ConfirmBookingResponse)
def confirm_booking(appointment_id: int, db: Session = Depends(get_db),
                     patient=Depends(require_role("patient"))):
    appt = db.query(models.Appointment).get(appointment_id)
    if not appt or appt.patient_id != patient.id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status != models.AppointmentStatus.held:
        raise HTTPException(status_code=400, detail="This appointment can't be confirmed")
    if appt.hold_expires_at and appt.hold_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Your slot hold expired. Please pick a slot again.")

    symptom_form = db.query(models.SymptomForm).filter(models.SymptomForm.appointment_id == appointment_id).first()
    if not symptom_form:
        raise HTTPException(status_code=400, detail="Please submit your symptoms before confirming")

    # --- LLM pre-visit summary (never blocks booking on failure) ---
    result = llm_service.generate_pre_visit_summary(symptom_form.symptoms_text)
    summary = models.PreVisitSummary(
        appointment_id=appointment_id,
        urgency_level=result["urgency_level"],
        chief_complaint=result["chief_complaint"],
        suggested_questions=json.dumps(result["suggested_questions"]),
        raw_llm_response=result["raw"],
        llm_failed=result["llm_failed"],
    )
    db.add(summary)

    appt.status = models.AppointmentStatus.booked
    db.flush()

    doctor_user = appt.doctor.user

    # --- Calendar events for both sides (never blocks booking on failure) ---
    appt.google_event_id_patient = calendar_service.create_event(
        appt.patient_id, appt.patient.email,
        f"Appointment with {doctor_user.full_name}",
        f"Specialization: {appt.doctor.specialization}",
        appt.slot_start, appt.slot_end,
    )
    appt.google_event_id_doctor = calendar_service.create_event(
        doctor_user.id, doctor_user.email,
        f"Appointment with {appt.patient.full_name}",
        f"Chief complaint: {result['chief_complaint']}",
        appt.slot_start, appt.slot_end,
    )

    # --- Email confirmations to both sides (retried later if they fail) ---
    for user, notif_recipient_is_patient in ((appt.patient, True), (doctor_user, False)):
        subject, body = email_service.booking_confirmation_email(
            user.full_name,
            doctor_user.full_name if notif_recipient_is_patient else appt.patient.full_name,
            appt.slot_start,
        )
        ok, err = email_service.send_email(user.email, subject, body)
        db.add(models.NotificationLog(
            user_id=user.id, appointment_id=appt.id, channel="email",
            type=models.NotificationType.booking_confirmation,
            status=models.NotificationStatus.sent if ok else models.NotificationStatus.retrying,
            attempts=1, last_error=err, sent_at=datetime.utcnow() if ok else None,
        ))

    db.commit()
    db.refresh(appt)

    return schemas.ConfirmBookingResponse(
        appointment_id=appt.id,
        status=appt.status.value,
        pre_visit_summary={
            "urgency_level": summary.urgency_level,
            "chief_complaint": summary.chief_complaint,
            "suggested_questions": json.loads(summary.suggested_questions),
            "llm_failed": summary.llm_failed,
        },
    )


@router.post("/{appointment_id}/cancel")
def cancel_appointment(appointment_id: int, db: Session = Depends(get_db),
                        user=Depends(get_current_user)):
    appt = db.query(models.Appointment).get(appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    is_patient = user.role == models.RoleEnum.patient and appt.patient_id == user.id
    is_doctor = user.role == models.RoleEnum.doctor and appt.doctor.user_id == user.id
    is_admin = user.role == models.RoleEnum.admin
    if not (is_patient or is_doctor or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized to cancel this appointment")

    if appt.status not in (models.AppointmentStatus.held, models.AppointmentStatus.booked):
        raise HTTPException(status_code=400, detail="This appointment can't be cancelled")

    appt.status = (
        models.AppointmentStatus.cancelled_by_patient if is_patient
        else models.AppointmentStatus.cancelled_by_doctor
    )
    lock = db.query(models.SlotLock).filter(models.SlotLock.appointment_id == appointment_id).first()
    if lock:
        db.delete(lock)

    calendar_service.delete_event(appt.patient_id, appt.patient.email, appt.google_event_id_patient)
    calendar_service.delete_event(appt.doctor.user_id, appt.doctor.user.email, appt.google_event_id_doctor)

    if appt.status == models.AppointmentStatus.cancelled_by_patient:
        recipient, other_name = appt.doctor.user, appt.patient.full_name
    else:
        recipient, other_name = appt.patient, appt.doctor.user.full_name
    subject, body = email_service.cancellation_email(recipient.full_name, other_name, appt.slot_start)
    ok, err = email_service.send_email(recipient.email, subject, body)
    db.add(models.NotificationLog(
        user_id=recipient.id, appointment_id=appt.id, channel="email",
        type=models.NotificationType.cancellation,
        status=models.NotificationStatus.sent if ok else models.NotificationStatus.retrying,
        attempts=1, last_error=err, sent_at=datetime.utcnow() if ok else None,
    ))

    db.commit()
    return {"ok": True, "status": appt.status.value}


@router.get("/mine", response_model=list[schemas.AppointmentOut])
def my_appointments(db: Session = Depends(get_db), patient=Depends(require_role("patient"))):
    appts = db.query(models.Appointment).filter(
        models.Appointment.patient_id == patient.id,
        models.Appointment.status.in_([models.AppointmentStatus.booked, models.AppointmentStatus.completed]),
    ).order_by(models.Appointment.slot_start.desc()).all()
    return [_appt_out(a) for a in appts]


@router.get("/{appointment_id}/pre-visit-summary")
def get_pre_visit_summary(appointment_id: int, db: Session = Depends(get_db),
                           user=Depends(get_current_user)):
    appt = db.query(models.Appointment).get(appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    allowed = (appt.patient_id == user.id) or (appt.doctor.user_id == user.id) or (user.role == models.RoleEnum.admin)
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized")
    s = appt.pre_visit_summary
    symptoms = appt.symptom_form.symptoms_text if appt.symptom_form else None
    if not s:
        return {"pre_visit_summary": None, "symptoms_text": symptoms}
    return {
        "pre_visit_summary": {
            "urgency_level": s.urgency_level,
            "chief_complaint": s.chief_complaint,
            "suggested_questions": json.loads(s.suggested_questions or "[]"),
            "llm_failed": s.llm_failed,
        },
        "symptoms_text": symptoms,
    }


@router.get("/doctor/mine", response_model=list[schemas.AppointmentOut])
def doctor_appointments(db: Session = Depends(get_db), doctor=Depends(require_role("doctor"))):
    profile = db.query(models.DoctorProfile).filter(models.DoctorProfile.user_id == doctor.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
    appts = db.query(models.Appointment).filter(
        models.Appointment.doctor_id == profile.id,
        models.Appointment.status.in_([models.AppointmentStatus.booked, models.AppointmentStatus.completed]),
    ).order_by(models.Appointment.slot_start.asc()).all()
    return [_appt_out(a) for a in appts]


@router.post("/{appointment_id}/notes")
def submit_visit_notes(appointment_id: int, payload: schemas.VisitNotesIn, db: Session = Depends(get_db),
                        doctor=Depends(require_role("doctor"))):
    appt = db.query(models.Appointment).get(appointment_id)
    if not appt or appt.doctor.user_id != doctor.id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status != models.AppointmentStatus.booked:
        raise HTTPException(status_code=400, detail="Notes can only be added to a booked appointment")

    notes = models.VisitNotes(
        appointment_id=appointment_id,
        clinical_notes=payload.clinical_notes,
        prescription_text=payload.prescription_text,
    )
    db.add(notes)

    result = llm_service.generate_post_visit_summary(payload.clinical_notes, payload.prescription_text)
    summary = models.PostVisitSummary(
        appointment_id=appointment_id,
        patient_summary_text=result["patient_summary_text"],
        medication_schedule=json.dumps(result["medication_schedule"]),
        follow_up_steps=result["follow_up_steps"],
        raw_llm_response=result["raw"],
        llm_failed=result["llm_failed"],
    )
    db.add(summary)

    # Schedule medication reminders from the structured schedule
    today = datetime.utcnow().date()
    default_times = ["09:00", "21:00"]
    for med in result["medication_schedule"]:
        freq_text = str(med.get("frequency", "")).lower()
        times = default_times[:1] if "once" in freq_text else default_times
        next_send = datetime.combine(today, dtime(*map(int, times[0].split(":"))))
        if next_send < datetime.utcnow():
            next_send += timedelta(days=1)
        db.add(models.MedicationReminder(
            appointment_id=appointment_id,
            medication_name=med.get("medication", "Medication"),
            dosage=med.get("dosage", ""),
            frequency_per_day=len(times),
            times=json.dumps(times),
            start_date=today,
            end_date=today + timedelta(days=7),
            next_send_at=next_send,
        ))

    appt.status = models.AppointmentStatus.completed
    db.commit()

    return {"ok": True, "post_visit_summary": {
        "patient_summary_text": summary.patient_summary_text,
        "medication_schedule": json.loads(summary.medication_schedule),
        "follow_up_steps": summary.follow_up_steps,
        "llm_failed": summary.llm_failed,
    }}


@router.get("/{appointment_id}/post-visit-summary", response_model=schemas.PostVisitSummaryOut)
def get_post_visit_summary(appointment_id: int, db: Session = Depends(get_db),
                            user=Depends(get_current_user)):
    appt = db.query(models.Appointment).get(appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    allowed = (appt.patient_id == user.id) or (appt.doctor.user_id == user.id) or (user.role == models.RoleEnum.admin)
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized")
    s = appt.post_visit_summary
    if not s:
        raise HTTPException(status_code=404, detail="No post-visit summary yet")
    return schemas.PostVisitSummaryOut(
        patient_summary_text=s.patient_summary_text,
        medication_schedule=json.loads(s.medication_schedule or "[]"),
        follow_up_steps=s.follow_up_steps,
        llm_failed=s.llm_failed,
    )
