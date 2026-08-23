from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import hash_password, verify_password, create_access_token
from ..deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.TokenResponse)
def register_patient(payload: schemas.RegisterPatient, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = models.User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=models.RoleEnum.patient,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id), role=user.role.value)
    return schemas.TokenResponse(access_token=token, role=user.role.value, user_id=user.id, full_name=user.full_name)


@router.post("/login", response_model=schemas.TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token(subject=str(user.id), role=user.role.value)
    return schemas.TokenResponse(access_token=token, role=user.role.value, user_id=user.id, full_name=user.full_name)


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user
