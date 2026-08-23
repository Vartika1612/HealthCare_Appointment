import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, SessionLocal
from . import models
from .auth import hash_password
from .routers import auth, admin, doctors, appointments, calendar
from .services.scheduler import start_scheduler, shutdown_scheduler

logging.basicConfig(level=logging.INFO)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Healthcare Appointment & Follow-up Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(doctors.router)
app.include_router(appointments.router)
app.include_router(calendar.router)


DEFAULT_ADMIN_EMAIL = "admin@clinic.test"
DEFAULT_ADMIN_PASSWORD = "AdminPass123!"


def _bootstrap_admin():
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.role == models.RoleEnum.admin).first()
        if existing:
            return
        admin_user = models.User(
            email=DEFAULT_ADMIN_EMAIL,
            password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
            full_name="Clinic Admin",
            role=models.RoleEnum.admin,
        )
        db.add(admin_user)
        db.commit()
        logging.info(f"Bootstrapped default admin account: {DEFAULT_ADMIN_EMAIL} / {DEFAULT_ADMIN_PASSWORD}")
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    _bootstrap_admin()
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    shutdown_scheduler()


@app.get("/api/health")
def health():
    return {"status": "ok"}
