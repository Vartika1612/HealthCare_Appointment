"""
Google Calendar integration.

USE_MOCK_CALENDAR=true (default) simulates event creation/update/deletion and
returns fake event ids, with actions logged to backend/sent_emails/../calendar_log.txt
so the app is runnable with zero Google setup.

To go live: set USE_MOCK_CALENDAR=false, register an OAuth 2.0 Client (Desktop
or Web) in Google Cloud Console with the Calendar API enabled, set
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI, and have each
user complete the consent flow at GET /api/calendar/authorize (see README's
"Google Calendar setup steps"). Access/refresh tokens would then be stored
per-user (e.g. in a `calendar_credentials` table) - omitted here for brevity
but the storage point is marked below.
"""
import os
import uuid
from datetime import datetime
from typing import Optional
from ..config import settings

_LOG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "calendar_log.txt")


def _log(line: str):
    with open(_LOG_PATH, "a") as f:
        f.write(f"{datetime.utcnow().isoformat()} | {line}\n")


def _get_credentials_for_user(user_id: int):
    """
    Real implementation would load stored OAuth2 credentials for this user
    (refreshing the access token if expired) from a credentials table, e.g.:

        creds_row = db.query(CalendarCredential).filter_by(user_id=user_id).first()
        creds = google.oauth2.credentials.Credentials(**creds_row.to_dict())

    Left unimplemented in mock mode.
    """
    raise NotImplementedError("Real Google Calendar mode requires stored per-user OAuth credentials")


def create_event(user_id: int, user_email: str, summary: str, description: str,
                  start: datetime, end: datetime) -> Optional[str]:
    """Returns a calendar event id, or None on failure (never raises)."""
    if settings.use_mock_calendar:
        event_id = f"mock-{uuid.uuid4().hex[:12]}"
        _log(f"CREATE user={user_email} event={event_id} '{summary}' {start}->{end}")
        return event_id

    try:
        from googleapiclient.discovery import build
        creds = _get_credentials_for_user(user_id)
        service = build("calendar", "v3", credentials=creds)
        event = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        }
        created = service.events().insert(calendarId="primary", body=event).execute()
        return created.get("id")
    except Exception as e:
        _log(f"CREATE_FAILED user={user_email} error={e}")
        return None


def update_event(user_id: int, user_email: str, event_id: str, summary: str,
                  start: datetime, end: datetime) -> bool:
    if not event_id:
        return False
    if settings.use_mock_calendar:
        _log(f"UPDATE user={user_email} event={event_id} '{summary}' {start}->{end}")
        return True
    try:
        from googleapiclient.discovery import build
        creds = _get_credentials_for_user(user_id)
        service = build("calendar", "v3", credentials=creds)
        service.events().patch(
            calendarId="primary", eventId=event_id,
            body={
                "summary": summary,
                "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
                "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
            },
        ).execute()
        return True
    except Exception as e:
        _log(f"UPDATE_FAILED user={user_email} event={event_id} error={e}")
        return False


def delete_event(user_id: int, user_email: str, event_id: str) -> bool:
    if not event_id:
        return True
    if settings.use_mock_calendar:
        _log(f"DELETE user={user_email} event={event_id}")
        return True
    try:
        from googleapiclient.discovery import build
        creds = _get_credentials_for_user(user_id)
        service = build("calendar", "v3", credentials=creds)
        service.events().delete(calendarId="primary", eventId=event_id).execute()
        return True
    except Exception as e:
        _log(f"DELETE_FAILED user={user_email} event={event_id} error={e}")
        return False
