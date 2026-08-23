from datetime import datetime, time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import hash_password
from ..deps import require_role
from ..services import email_service, calendar_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _doctor_out(profile: models.DoctorProfile) -> schemas.DoctorOut:
    return schemas.DoctorOut(
        id=profile.id,
        user_id=profile.user_id,
        full_name=profile.user.full_name,
        specialization=profile.specialization,
        slot_duration_minutes=profile.slot_duration_minutes,
        bio=profile.bio or "",
        active=profile.active,
    )


@router.post("/doctors", response_model=schemas.DoctorOut)
def create_doctor(payload: schemas.DoctorCreate, db: Session = Depends(get_db),
                   admin=Depends(require_role("admin"))):
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = models.User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=models.RoleEnum.doctor,
    )
    db.add(user)
    db.flush()

    profile = models.DoctorProfile(
        user_id=user.id,
        specialization=payload.specialization,
        slot_duration_minutes=payload.slot_duration_minutes,
        bio=payload.bio or "",
    )
    db.add(profile)
    db.flush()

    for wh in payload.working_hours:
        db.add(models.WorkingHours(
            doctor_id=profile.id, weekday=wh.weekday,
            start_time=wh.start_time, end_time=wh.end_time,
        ))

    db.commit()
    db.refresh(profile)
    return _doctor_out(profile)


@router.get("/doctors", response_model=list[schemas.DoctorOut])
def list_doctors(db: Session = Depends(get_db), admin=Depends(require_role("admin"))):
    profiles = db.query(models.DoctorProfile).all()
    return [_doctor_out(p) for p in profiles]


@router.put("/doctors/{doctor_id}", response_model=schemas.DoctorOut)
def update_doctor(doctor_id: int, payload: schemas.DoctorUpdate, db: Session = Depends(get_db),
                   admin=Depends(require_role("admin"))):
    profile = db.query(models.DoctorProfile).get(doctor_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if payload.specialization is not None:
        profile.specialization = payload.specialization
    if payload.slot_duration_minutes is not None:
        profile.slot_duration_minutes = payload.slot_duration_minutes
    if payload.bio is not None:
        profile.bio = payload.bio
    if payload.active is not None:
        profile.active = payload.active
    if payload.working_hours is not None:
        db.query(models.WorkingHours).filter(models.WorkingHours.doctor_id == doctor_id).delete()
        for wh in payload.working_hours:
            db.add(models.WorkingHours(doctor_id=doctor_id, weekday=wh.weekday,
                                        start_time=wh.start_time, end_time=wh.end_time))

    db.commit()
    db.refresh(profile)
    return _doctor_out(profile)


@router.get("/doctors/{doctor_id}/leaves", response_model=list[schemas.LeaveOut])
def list_leaves(doctor_id: int, db: Session = Depends(get_db), admin=Depends(require_role("admin"))):
    return db.query(models.Leave).filter(models.Leave.doctor_id == doctor_id).all()


@router.post("/doctors/{doctor_id}/leaves", response_model=schemas.LeaveOut)
def add_leave(doctor_id: int, payload: schemas.LeaveIn, db: Session = Depends(get_db),
              admin=Depends(require_role("admin"))):
    """
    Marks a doctor on leave for a date. Any existing booked appointments on
    that date are auto-cancelled, their slot locks released, calendar events
    removed, and the affected patients notified by email - see
    SYSTEM_DESIGN.md "Doctor leave conflict handling".
    """
    profile = db.query(models.DoctorProfile).get(doctor_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor not found")

    existing = db.query(models.Leave).filter(
        models.Leave.doctor_id == doctor_id, models.Leave.date == payload.date
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Doctor is already on leave that day")

    leave = models.Leave(doctor_id=doctor_id, date=payload.date, reason=payload.reason or "")
    db.add(leave)

    day_start = datetime.combine(payload.date, time.min)
    day_end = datetime.combine(payload.date, time.max)
    affected = db.query(models.Appointment).filter(
        models.Appointment.doctor_id == doctor_id,
        models.Appointment.slot_start >= day_start,
        models.Appointment.slot_start <= day_end,
        models.Appointment.status == models.AppointmentStatus.booked,
    ).all()

    for appt in affected:
        appt.status = models.AppointmentStatus.cancelled_by_leave
        lock = db.query(models.SlotLock).filter(models.SlotLock.appointment_id == appt.id).first()
        if lock:
            db.delete(lock)

        calendar_service.delete_event(appt.patient_id, appt.patient.email, appt.google_event_id_patient)
        calendar_service.delete_event(profile.user_id, profile.user.email, appt.google_event_id_doctor)

        subject, body = email_service.leave_notice_email(appt.patient.full_name, profile.user.full_name, appt.slot_start)
        ok, err = email_service.send_email(appt.patient.email, subject, body)
        db.add(models.NotificationLog(
            user_id=appt.patient_id, appointment_id=appt.id, channel="email",
            type=models.NotificationType.leave_notice,
            status=models.NotificationStatus.sent if ok else models.NotificationStatus.retrying,
            attempts=1, last_error=err,
            sent_at=datetime.utcnow() if ok else None,
        ))

    db.commit()
    db.refresh(leave)
    return leave


@router.delete("/doctors/{doctor_id}/leaves/{leave_id}")
def remove_leave(doctor_id: int, leave_id: int, db: Session = Depends(get_db),
                  admin=Depends(require_role("admin"))):
    leave = db.query(models.Leave).filter(models.Leave.id == leave_id, models.Leave.doctor_id == doctor_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave not found")
    db.delete(leave)
    db.commit()
    return {"ok": True}
