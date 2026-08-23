import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Enum, Boolean,
    Text, UniqueConstraint, Date, Time
)
from sqlalchemy.orm import relationship
from .database import Base


class RoleEnum(str, enum.Enum):
    patient = "patient"
    doctor = "doctor"
    admin = "admin"


class AppointmentStatus(str, enum.Enum):
    held = "held"                      # temporary slot hold while patient fills symptom form
    booked = "booked"                  # confirmed booking
    completed = "completed"            # visit happened, post-visit notes added
    cancelled_by_patient = "cancelled_by_patient"
    cancelled_by_doctor = "cancelled_by_doctor"
    cancelled_by_leave = "cancelled_by_leave"   # auto-cancelled due to doctor leave
    expired = "expired"                # hold expired without confirmation


class NotificationType(str, enum.Enum):
    booking_confirmation = "booking_confirmation"
    reminder_24h = "reminder_24h"
    cancellation = "cancellation"
    leave_notice = "leave_notice"
    medication_reminder = "medication_reminder"


class NotificationStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"
    retrying = "retrying"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    role = Column(Enum(RoleEnum), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    doctor_profile = relationship("DoctorProfile", back_populates="user", uselist=False)


class DoctorProfile(Base):
    __tablename__ = "doctor_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    specialization = Column(String, nullable=False, index=True)
    slot_duration_minutes = Column(Integer, default=30, nullable=False)
    bio = Column(Text, default="")
    active = Column(Boolean, default=True)

    user = relationship("User", back_populates="doctor_profile")
    working_hours = relationship("WorkingHours", back_populates="doctor", cascade="all, delete-orphan")
    leaves = relationship("Leave", back_populates="doctor", cascade="all, delete-orphan")


class WorkingHours(Base):
    """Recurring weekly availability, e.g. Mon 09:00-17:00."""
    __tablename__ = "working_hours"

    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer, ForeignKey("doctor_profiles.id"), nullable=False)
    weekday = Column(Integer, nullable=False)  # 0=Monday ... 6=Sunday
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    doctor = relationship("DoctorProfile", back_populates="working_hours")


class Leave(Base):
    __tablename__ = "leaves"

    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer, ForeignKey("doctor_profiles.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    reason = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    doctor = relationship("DoctorProfile", back_populates="leaves")

    __table_args__ = (UniqueConstraint("doctor_id", "date", name="uq_doctor_leave_date"),)


class SlotLock(Base):
    """
    Concurrency guard: exactly one row can exist per (doctor_id, slot_start)
    while a slot is held or booked. The DB-level unique constraint is what
    actually prevents double booking under simultaneous requests - see
    SYSTEM_DESIGN.md.
    """
    __tablename__ = "slot_locks"

    id = Column(Integer, primary_key=True)
    doctor_id = Column(Integer, ForeignKey("doctor_profiles.id"), nullable=False)
    slot_start = Column(DateTime, nullable=False)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)

    __table_args__ = (UniqueConstraint("doctor_id", "slot_start", name="uq_doctor_slot"),)


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctor_profiles.id"), nullable=False)
    slot_start = Column(DateTime, nullable=False, index=True)
    slot_end = Column(DateTime, nullable=False)
    status = Column(Enum(AppointmentStatus), default=AppointmentStatus.held, nullable=False)
    hold_expires_at = Column(DateTime, nullable=True)

    google_event_id_patient = Column(String, nullable=True)
    google_event_id_doctor = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("User", foreign_keys=[patient_id])
    doctor = relationship("DoctorProfile")
    symptom_form = relationship("SymptomForm", back_populates="appointment", uselist=False, cascade="all, delete-orphan")
    pre_visit_summary = relationship("PreVisitSummary", back_populates="appointment", uselist=False, cascade="all, delete-orphan")
    visit_notes = relationship("VisitNotes", back_populates="appointment", uselist=False, cascade="all, delete-orphan")
    post_visit_summary = relationship("PostVisitSummary", back_populates="appointment", uselist=False, cascade="all, delete-orphan")
    medication_reminders = relationship("MedicationReminder", back_populates="appointment", cascade="all, delete-orphan")


class SymptomForm(Base):
    __tablename__ = "symptom_forms"

    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), unique=True, nullable=False)
    symptoms_text = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    appointment = relationship("Appointment", back_populates="symptom_form")


class PreVisitSummary(Base):
    __tablename__ = "pre_visit_summaries"

    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), unique=True, nullable=False)
    urgency_level = Column(String, nullable=True)     # Low / Medium / High
    chief_complaint = Column(Text, nullable=True)
    suggested_questions = Column(Text, nullable=True)  # JSON-encoded list
    raw_llm_response = Column(Text, nullable=True)
    llm_failed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    appointment = relationship("Appointment", back_populates="pre_visit_summary")


class VisitNotes(Base):
    """Doctor's raw post-visit clinical notes + prescription."""
    __tablename__ = "visit_notes"

    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), unique=True, nullable=False)
    clinical_notes = Column(Text, nullable=False)
    prescription_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    appointment = relationship("Appointment", back_populates="visit_notes")


class PostVisitSummary(Base):
    __tablename__ = "post_visit_summaries"

    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), unique=True, nullable=False)
    patient_summary_text = Column(Text, nullable=True)
    medication_schedule = Column(Text, nullable=True)  # JSON-encoded list
    follow_up_steps = Column(Text, nullable=True)
    raw_llm_response = Column(Text, nullable=True)
    llm_failed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    appointment = relationship("Appointment", back_populates="post_visit_summary")


class MedicationReminder(Base):
    __tablename__ = "medication_reminders"

    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)
    medication_name = Column(String, nullable=False)
    dosage = Column(String, nullable=True)
    frequency_per_day = Column(Integer, default=1)
    times = Column(Text, nullable=False)   # JSON list of "HH:MM" strings
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    next_send_at = Column(DateTime, nullable=True, index=True)
    active = Column(Boolean, default=True)

    appointment = relationship("Appointment", back_populates="medication_reminders")


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    channel = Column(String, default="email")
    type = Column(Enum(NotificationType), nullable=False)
    status = Column(Enum(NotificationStatus), default=NotificationStatus.pending)
    attempts = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
