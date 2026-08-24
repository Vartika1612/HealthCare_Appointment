# Meridian Clinic — Healthcare Appointment & Follow-up Manager

A full-stack clinic platform with separate portals for **patients**, **doctors**, and an **admin**.
Patients book appointments and share symptoms in advance; doctors get an AI pre-visit summary and
give an AI-generated patient-friendly post-visit summary; both sides get email + Google Calendar
notifications throughout.

- **Backend:** Python, FastAPI, SQLAlchemy, SQLite (swap-in Postgres via `DATABASE_URL`)
- **Frontend:** React (Vite), React Router, Axios
- **LLM:** Anthropic API (pluggable; runs with a mock by default — no key required)
- **Email:** SMTP-compatible (SendGrid/Mailgun/etc.); mock mode writes to disk by default
- **Calendar:** Google Calendar API via OAuth 2.0; mock mode simulates events by default

The app is fully runnable out of the box with **zero external API keys** — every third-party
integration (LLM, email, calendar) has a mock mode that's on by default, so you can see the whole
system working end to end and then flip each one to "live" independently.

---

## 1. Quick start

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # defaults already use mock LLM/email/calendar
uvicorn app.main:app --reload --port 8000
```

On first startup the app auto-creates the SQLite DB and bootstraps a default admin account:

```
email:    admin@clinic.test
password: AdminPass123!
```

API docs (Swagger UI) are available at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env            # points at http://localhost:8000 by default
npm run dev
```

Open `http://localhost:5173`. Log in as the default admin to create your first doctor, then
register a patient account (or use the "Create an account" link) to try booking.

---

## 2. Environment variables (`backend/.env.example`)

| Variable | Purpose | Default |
|---|---|---|
| `SECRET_KEY` | JWT signing secret — **change in production** | dev placeholder |
| `DATABASE_URL` | SQLAlchemy connection string | `sqlite:///./clinic.db` |
| `USE_MOCK_LLM` | `true` = canned structured responses, no API key needed | `true` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Used when `USE_MOCK_LLM=false` | — |
| `USE_MOCK_EMAIL` | `true` = emails written to `backend/sent_emails/*.txt` instead of sent | `true` |
| `SMTP_HOST/PORT/USERNAME/PASSWORD`, `EMAIL_FROM` | Used when `USE_MOCK_EMAIL=false` (works with SendGrid, Mailgun, or any SMTP relay) | — |
| `USE_MOCK_CALENDAR` | `true` = simulated events logged to `backend/calendar_log.txt` | `true` |
| `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI` | Used when `USE_MOCK_CALENDAR=false` | — |
| `REMINDER_POLL_SECONDS` | Background job polling interval | `60` |

## 2b. Frontend environment variables (`frontend/.env.example`)

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_URL` | Base URL of the backend API | `http://localhost:8000` |

---

## 3. Going live with each integration

### LLM (Anthropic)
Set `USE_MOCK_LLM=false` and `ANTHROPIC_API_KEY=sk-ant-...` in `backend/.env`. No code changes
needed — `app/services/llm_service.py` switches implementations automatically. The two prompts
used are documented in section 6 below; both instruct the model to answer in strict JSON, and the
response is parsed and validated before being stored. If the call fails or returns unparseable
output after 3 retries (exponential backoff via `tenacity`), the app falls back to a safe
mock-based summary and marks `llm_failed: true` on the record — a summary failure never blocks a
booking or a completed visit.

### Email (SendGrid / Mailgun / any SMTP)
Set `USE_MOCK_EMAIL=false` and fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`,
`EMAIL_FROM`. For SendGrid: host `smtp.sendgrid.net`, port `587`, username `apikey`, password =
your SendGrid API key. For Mailgun: host `smtp.mailgun.org`, port `587`, username/password from
your Mailgun SMTP credentials.

### Google Calendar setup steps
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or reuse one)
   and enable the **Google Calendar API**.
2. Under **APIs & Services → Credentials**, create an **OAuth 2.0 Client ID**
   (type: Web application). Add `http://localhost:8000/api/calendar/oauth2callback` as an
   authorized redirect URI (adjust for your deployed domain).
3. Copy the Client ID/Secret into `backend/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`,
   and set `GOOGLE_REDIRECT_URI` to match what you registered.
4. Set `USE_MOCK_CALENDAR=false`.
5. Google Calendar OAuth 2.0 is implemented through `/api/calendar/authorize` and `/api/calendar/oauth2callback`. User calendar credentials are stored in the `calendar_credentials` table. Set `USE_MOCK_CALENDAR=false` and configure the Google OAuth credentials to enable live calendar integration.

---

## 4. Live Demo

- **Frontend:** https://healthcare-appointment.vercel.app
- **Backend API:** https://healthcare-appointment-backend.onrender.com
- **API Documentation:** https://healthcare-appointment-backend.onrender.com/docs

---

## 5. Database schema

| Table | Purpose |
|---|---|
| `users` | All accounts (patient / doctor / admin), bcrypt-hashed passwords |
| `doctor_profiles` | 1:1 with a doctor `user` — specialization, slot duration, active flag |
| `working_hours` | Recurring weekly availability per doctor (weekday + start/end time) |
| `leaves` | Doctor leave days (unique per doctor+date) |
| `appointments` | Core booking record — status machine: `held → booked → completed`, or `cancelled_by_patient / cancelled_by_doctor / cancelled_by_leave / expired` |
| `slot_locks` | **Concurrency guard.** Unique `(doctor_id, slot_start)` — see §7 for why this table exists |
| `symptom_forms` | Patient's free-text symptoms, 1:1 with an appointment |
| `pre_visit_summaries` | LLM output: urgency, chief complaint, suggested questions |
| `visit_notes` | Doctor's raw clinical notes + prescription text |
| `post_visit_summaries` | LLM output: patient-friendly summary, medication schedule, follow-up |
| `medication_reminders` | Derived from the medication schedule; polled by the background job |
| `notification_logs` | Every email attempt (booking/reminder/cancellation/leave/medication), with retry bookkeeping |

Full column-level detail is in `backend/app/models.py` (SQLAlchemy is the source of truth).

---

## 5. API overview

All endpoints are prefixed `/api`. Full interactive docs at `/docs`. Auth uses JWT bearer tokens
(`Authorization: Bearer <token>`), obtained from `/api/auth/login` (OAuth2 password flow) or
`/api/auth/register`.

| Method & path | Role | Purpose |
|---|---|---|
| `POST /api/auth/register` | public | Patient self-registration |
| `POST /api/auth/login` | public | Login (all roles) |
| `GET /api/auth/me` | any | Current user |
| `POST /api/admin/doctors` | admin | Create doctor + working hours |
| `GET/PUT /api/admin/doctors/{id}` | admin | List / update doctor profile |
| `POST /api/admin/doctors/{id}/leaves` | admin | Add leave day — auto-cancels conflicting bookings, notifies patients |
| `DELETE /api/admin/doctors/{id}/leaves/{leave_id}` | admin | Remove leave day |
| `GET /api/doctors` | any | Search doctors, optional `?specialization=` |
| `GET /api/doctors/{id}/slots?date=` | any | Computed open slots for a date |
| `POST /api/appointments/hold` | patient | Temporarily hold a slot (10 min) |
| `POST /api/appointments/{id}/symptoms` | patient | Submit symptom form |
| `POST /api/appointments/{id}/confirm` | patient | Confirm booking → LLM pre-visit summary, emails, calendar events |
| `POST /api/appointments/{id}/cancel` | patient/doctor/admin | Cancel a held/booked appointment |
| `GET /api/appointments/mine` | patient | My appointments |
| `GET /api/appointments/doctor/mine` | doctor | My appointments |
| `GET /api/appointments/{id}/pre-visit-summary` | patient/doctor/admin | Fetch pre-visit summary |
| `POST /api/appointments/{id}/notes` | doctor | Submit clinical notes + prescription → LLM post-visit summary, medication reminders scheduled |
| `GET /api/appointments/{id}/post-visit-summary` | patient/doctor/admin | Fetch post-visit summary |

---

## 6. LLM prompts (as specified)

**Pre-visit summary**, run against the patient's submitted symptoms text:

> Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and
> three suggested questions for the doctor. Symptoms: `<symptoms>`

**Post-visit summary**, run against the doctor's clinical notes + prescription:

> Convert these clinical notes into a patient-friendly summary with medication schedule and
> follow-up steps: `<notes>`

Both are wrapped with a system prompt instructing strict JSON output (see
`backend/app/services/llm_service.py`) so responses can be parsed deterministically and stored in
`pre_visit_summaries` / `post_visit_summaries`.

---

## 7. Design notes

See **`SYSTEM_DESIGN.md`** for the full write-up covering double-booking prevention, doctor leave
conflict handling, the slot hold mechanism, and notification failure handling.

---

## 8. Deployment

The backend is a standard ASGI app (`app.main:app`) deployable to Render/Railway/Fly.io with a
`Procfile`/start command of:

```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

For SQLite in production, mount a persistent disk (Render/Railway both support this) or switch
`DATABASE_URL` to a managed Postgres instance — no code changes required, SQLAlchemy handles both.

The frontend (`npm run build`) produces a static `dist/` folder deployable to Vercel/Netlify/any
static host; set `VITE_API_URL` to your deployed backend's URL as a build-time env var.

---

## 9. Project structure

```
backend/
  app/
    main.py              # FastAPI app, startup/shutdown, CORS
    config.py             # Settings from .env
    database.py            # SQLAlchemy engine/session
    models.py               # ORM schema (see §4)
    schemas.py                # Pydantic request/response models
    auth.py                     # Password hashing, JWT
    deps.py                      # get_current_user, require_role
    routers/
      auth.py, admin.py, doctors.py, appointments.py
    services/
      llm_service.py           # Anthropic + mock, prompts from §6
      email_service.py          # SMTP + mock, templated messages
      calendar_service.py        # Google Calendar + mock
      scheduler.py                # APScheduler background jobs
  requirements.txt
  .env.example
frontend/
  src/
    api.js                # Axios client with auth interceptor
    context/AuthContext.jsx
    components/Shell.jsx, ProtectedRoute.jsx
    pages/
      Login.jsx, Register.jsx
      PatientDashboard.jsx   # search/book/symptoms/confirm/my appointments
      DoctorDashboard.jsx     # pre-visit summaries, post-visit notes
      AdminDashboard.jsx       # doctor CRUD, working hours, leave
  .env.example
SYSTEM_DESIGN.md
```
