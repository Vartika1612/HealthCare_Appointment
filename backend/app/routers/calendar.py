from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from google_auth_oauthlib.flow import Flow

from ..database import get_db
from ..deps import get_current_user
from ..config import settings
from .. import models

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]

def get_client_config():
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }

@router.get("/status")
def get_calendar_status(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if settings.use_mock_calendar:
        return {"connected": True, "mock": True}
    creds = db.query(models.CalendarCredential).filter(models.CalendarCredential.user_id == current_user.id).first()
    return {"connected": creds is not None, "mock": False}

@router.get("/authorize")
def authorize_calendar(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if settings.use_mock_calendar:
        creds_row = db.query(models.CalendarCredential).filter(models.CalendarCredential.user_id == current_user.id).first()
        if not creds_row:
            creds_row = models.CalendarCredential(
                user_id=current_user.id,
                token="mock-token",
                refresh_token="mock-refresh-token",
                token_uri="https://oauth2.googleapis.com/token",
                client_id="mock-client-id",
                client_secret="mock-client-secret",
                scopes=",".join(SCOPES)
            )
            db.add(creds_row)
            db.commit()
        return {"auth_url": "http://localhost:5173/?calendar=connected_mock"}

    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=400,
            detail="Google Calendar OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env or set USE_MOCK_CALENDAR=true."
        )
        
    flow = Flow.from_client_config(
        get_client_config(),
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=str(current_user.id)
    )
    return {"auth_url": auth_url}

@router.get("/oauth2callback")
def oauth2callback(state: str, code: str, db: Session = Depends(get_db)):
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=400, detail="Google Calendar OAuth is not configured.")

    try:
        user_id = int(state)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state")

    flow = Flow.from_client_config(
        get_client_config(),
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    
    flow.fetch_token(code=code)
    credentials = flow.credentials

    creds_row = db.query(models.CalendarCredential).filter(models.CalendarCredential.user_id == user_id).first()
    if not creds_row:
        creds_row = models.CalendarCredential(user_id=user_id)
        db.add(creds_row)
    
    creds_row.token = credentials.token
    creds_row.refresh_token = credentials.refresh_token or creds_row.refresh_token
    creds_row.token_uri = credentials.token_uri
    creds_row.client_id = credentials.client_id
    creds_row.client_secret = credentials.client_secret
    creds_row.scopes = ",".join(credentials.scopes)
    
    db.commit()

    return RedirectResponse(url="http://localhost:5173/")

