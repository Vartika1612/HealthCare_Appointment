from datetime import datetime, date, timedelta, time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/doctors", tags=["doctors"])


def _doctor_out(profile: models.DoctorProfile) -> schemas.DoctorOut:
    return schemas.DoctorOut(
        id=profile.id, user_id=profile.user_id, full_name=profile.user.full_name,
        specialization=profile.specialization, slot_duration_minutes=profile.slot_duration_minutes,
        bio=profile.bio or "", active=profile.active,
    )


@router.get("", response_model=list[schemas.DoctorOut])
def list_doctors(specialization: Optional[str] = Query(None), db: Session = Depends(get_db)):
    q = db.query(models.DoctorProfile).filter(models.DoctorProfile.active == True)  # noqa: E712
    if specialization:
        q = q.filter(models.DoctorProfile.specialization.ilike(f"%{specialization}%"))
    return [_doctor_out(p) for p in q.all()]


@router.get("/specializations", response_model=list[str])
def list_specializations(db: Session = Depends(get_db)):
    rows = db.query(models.DoctorProfile.specialization).distinct().all()
    return sorted({r[0] for r in rows})


@router.get("/{doctor_id}/slots", response_model=list[schemas.SlotOut])
def get_available_slots(doctor_id: int, for_date: date = Query(..., alias="date"),
                         db: Session = Depends(get_db)):
    profile = db.query(models.DoctorProfile).get(doctor_id)
    if not profile or not profile.active:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if for_date < datetime.utcnow().date():
        return []

    on_leave = db.query(models.Leave).filter(
        models.Leave.doctor_id == doctor_id, models.Leave.date == for_date
    ).first()
    if on_leave:
        return []

    weekday = for_date.weekday()
    hours = db.query(models.WorkingHours).filter(
        models.WorkingHours.doctor_id == doctor_id, models.WorkingHours.weekday == weekday
    ).all()
    if not hours:
        return []

    duration = timedelta(minutes=profile.slot_duration_minutes)

    day_start = datetime.combine(for_date, time.min)
    day_end = datetime.combine(for_date, time.max)
    taken = db.query(models.SlotLock.slot_start).filter(
        models.SlotLock.doctor_id == doctor_id,
        models.SlotLock.slot_start >= day_start,
        models.SlotLock.slot_start <= day_end,
    ).all()
    taken_set = {t[0] for t in taken}

    now = datetime.utcnow()
    slots = []
    for wh in hours:
        cursor = datetime.combine(for_date, wh.start_time)
        end = datetime.combine(for_date, wh.end_time)
        while cursor + duration <= end:
            if cursor not in taken_set and cursor > now:
                slots.append(schemas.SlotOut(start=cursor, end=cursor + duration))
            cursor += duration

    return sorted(slots, key=lambda s: s.start)
