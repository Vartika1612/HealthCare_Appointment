"""
Email delivery abstraction.

USE_MOCK_EMAIL=true (default) writes each email to backend/sent_emails/ as a
.txt file instead of actually sending, so the app is fully runnable with no
email provider configured. Set USE_MOCK_EMAIL=false and fill in SMTP_* to
send through SendGrid / Mailgun / any SMTP provider.

Callers should treat send_email's return value as authoritative and log the
result via NotificationLog; failures are retried by the background job in
services/scheduler.py rather than raised, so a flaky provider never breaks
booking, cancellation, or reminder flows.
"""
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from datetime import datetime
from typing import Optional
from ..config import settings

SENT_EMAILS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "sent_emails")


def _send_mock(to_email: str, subject: str, body: str) -> tuple[bool, Optional[str]]:
    try:
        os.makedirs(SENT_EMAILS_DIR, exist_ok=True)
        ts = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        safe_to = to_email.replace("@", "_at_")
        path = os.path.join(SENT_EMAILS_DIR, f"{ts}_{safe_to}.txt")
        with open(path, "w") as f:
            f.write(f"To: {to_email}\nSubject: {subject}\n\n{body}\n")
        return True, None
    except Exception as e:
        return False, str(e)


def _send_smtp(to_email: str, subject: str, body: str) -> tuple[bool, Optional[str]]:
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = settings.email_from
        msg["To"] = to_email

        context = ssl.create_default_context()
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls(context=context)
            server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.email_from, [to_email], msg.as_string())
        return True, None
    except Exception as e:
        return False, str(e)


def send_email(to_email: str, subject: str, body: str) -> tuple[bool, Optional[str]]:
    """Returns (success, error_message)."""
    if settings.use_mock_email:
        return _send_mock(to_email, subject, body)
    return _send_smtp(to_email, subject, body)


# ---- Templated messages ----

def booking_confirmation_email(name: str, doctor_name: str, slot_start: datetime) -> tuple[str, str]:
    subject = "Appointment confirmed"
    body = (
        f"Hi {name},\n\n"
        f"Your appointment with {doctor_name} is confirmed for "
        f"{slot_start.strftime('%A, %d %B %Y at %H:%M')}.\n\n"
        "A calendar invite has been sent separately. See you then!\n\n- The Clinic"
    )
    return subject, body


def reminder_email(name: str, doctor_name: str, slot_start: datetime) -> tuple[str, str]:
    subject = "Appointment reminder"
    body = (
        f"Hi {name},\n\nThis is a reminder of your upcoming appointment with "
        f"{doctor_name} on {slot_start.strftime('%A, %d %B %Y at %H:%M')}.\n\n- The Clinic"
    )
    return subject, body


def cancellation_email(name: str, doctor_name: str, slot_start: datetime, reason: str = "") -> tuple[str, str]:
    subject = "Appointment cancelled"
    reason_line = f"\nReason: {reason}\n" if reason else ""
    body = (
        f"Hi {name},\n\nYour appointment with {doctor_name} on "
        f"{slot_start.strftime('%A, %d %B %Y at %H:%M')} has been cancelled.{reason_line}\n"
        "Please book a new slot at your convenience.\n\n- The Clinic"
    )
    return subject, body


def leave_notice_email(name: str, doctor_name: str, slot_start: datetime) -> tuple[str, str]:
    subject = "Your appointment needs to be rescheduled"
    body = (
        f"Hi {name},\n\n{doctor_name} is unavailable on "
        f"{slot_start.strftime('%A, %d %B %Y')}, so your {slot_start.strftime('%H:%M')} appointment "
        "has been cancelled. We're sorry for the inconvenience - please book a new slot.\n\n- The Clinic"
    )
    return subject, body


def medication_reminder_email(name: str, medication: str, dosage: str) -> tuple[str, str]:
    subject = "Medication reminder"
    body = f"Hi {name},\n\nTime to take your medication: {medication} ({dosage}).\n\n- The Clinic"
    return subject, body
