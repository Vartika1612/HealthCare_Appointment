from datetime import datetime, date, time
from typing import Optional, List
from pydantic import BaseModel, EmailStr, field_validator


# ---------- Auth ----------
class RegisterPatient(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    full_name: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str

    class Config:
        from_attributes = True


# ---------- Admin: doctor management ----------
class WorkingHoursIn(BaseModel):
    weekday: int  # 0=Mon..6=Sun
    start_time: time
    end_time: time


class DoctorCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    specialization: str
    slot_duration_minutes: int = 30
    bio: Optional[str] = ""
    working_hours: List[WorkingHoursIn] = []


class DoctorUpdate(BaseModel):
    specialization: Optional[str] = None
    slot_duration_minutes: Optional[int] = None
    bio: Optional[str] = None
    active: Optional[bool] = None
    working_hours: Optional[List[WorkingHoursIn]] = None


class DoctorOut(BaseModel):
    id: int
    user_id: int
    full_name: str
    specialization: str
    slot_duration_minutes: int
    bio: str
    active: bool

    class Config:
        from_attributes = True


class LeaveIn(BaseModel):
    date: date
    reason: Optional[str] = ""


class LeaveOut(BaseModel):
    id: int
    date: date
    reason: str

    class Config:
        from_attributes = True


# ---------- Appointments ----------
class SlotOut(BaseModel):
    start: datetime
    end: datetime


class HoldSlotRequest(BaseModel):
    doctor_id: int
    slot_start: datetime


class HoldSlotResponse(BaseModel):
    appointment_id: int
    hold_expires_at: datetime


class SymptomFormIn(BaseModel):
    symptoms_text: str

    @field_validator("symptoms_text")
    @classmethod
    def not_empty(cls, v):
        if not v.strip():
            raise ValueError("symptoms_text cannot be empty")
        return v


class ConfirmBookingResponse(BaseModel):
    appointment_id: int
    status: str
    pre_visit_summary: Optional[dict] = None


class AppointmentOut(BaseModel):
    id: int
    doctor_id: int
    doctor_name: str
    specialization: str
    patient_id: int
    patient_name: str
    slot_start: datetime
    slot_end: datetime
    status: str


class VisitNotesIn(BaseModel):
    clinical_notes: str
    prescription_text: str


class PostVisitSummaryOut(BaseModel):
    patient_summary_text: Optional[str]
    medication_schedule: Optional[list]
    follow_up_steps: Optional[str]
    llm_failed: bool
