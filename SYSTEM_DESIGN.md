# System Design Write-up

## Double-booking prevention

The naive approach — check "is this slot free?" then insert a booking — has a race window: two
patients can both pass the check before either insert commits. Application-level locking (a Python
lock, a Redis mutex) only works within a single process and doesn't survive multiple backend
instances, which this app should be able to scale to.

Instead, correctness is pushed down to the database. A dedicated `slot_locks` table has a
**unique constraint on `(doctor_id, slot_start)`**. Booking a slot is a single transaction that
inserts an `Appointment` row and a `SlotLock` row referencing it. If a second request tries to
lock the same `(doctor_id, slot_start)` concurrently, the database itself rejects the second
insert with an `IntegrityError` — regardless of process count or timing — because uniqueness
constraints are enforced atomically by the storage engine, not by application code. The API
catches that error and returns `409 Conflict` with a message to pick another slot.

This was verified directly: firing two simultaneous `POST /appointments/hold` requests for the
identical slot from two different patients, exactly one succeeded and the other received a clean
409 — no double booking, no crash, no need for external locking infrastructure. The same pattern
would work unchanged against Postgres in production (SQLite's constraint enforcement is
transaction-safe under `check_same_thread=False` for this app's write volume; Postgres is a drop-in
`DATABASE_URL` swap for higher concurrency).

## Slot hold mechanism

Booking isn't instant — the flow is *pick a slot → fill out symptoms → confirm*. If the slot were
only reserved at the final "confirm" step, another patient could take it while the first is mid-form,
leading to a frustrating late failure. So `POST /appointments/hold` immediately creates the
`SlotLock` (and an `Appointment` in `held` status) the moment a patient picks a time, giving them
exclusive claim to it for **10 minutes** (`hold_expires_at`). The symptom form and confirmation
both check this hold is still valid and reject with `410 Gone` if it expired, prompting the
patient to pick again.

Abandoned holds (patient closes the tab, changes their mind) can't be allowed to permanently lock
a slot. A background job (`expire_stale_holds`, polled every `REMINDER_POLL_SECONDS`, default 60s)
finds `held` appointments whose `hold_expires_at` has passed, flips them to `expired`, and deletes
their `SlotLock` row — releasing the slot back into availability without any manual cleanup.

## Doctor leave conflict handling

When an admin marks a doctor on leave for a date (`POST /admin/doctors/{id}/leaves`), the leave
record and the conflict resolution happen in **one transaction**: the app queries all `booked`
appointments for that doctor on that date, and for each one it (1) sets status to
`cancelled_by_leave`, (2) deletes the corresponding `SlotLock` so the freed time isn't stuck as
unavailable, (3) deletes both patient's and doctor's Google Calendar events, and (4) sends the
patient a cancellation-with-explanation email, logged in `notification_logs`. Because this all
happens before the transaction commits, a failure partway through rolls back cleanly rather than
leaving the leave day recorded but patients un-notified — with email/calendar side effects still
attempted best-effort and logged rather than blocking the leave itself (see below). Only `booked`
appointments are touched; already-`completed` visits and other doctors' schedules are untouched,
and a doctor can't be double-marked on leave for the same day (unique `doctor_id, date` constraint).

## Notification failure handling

Email delivery is treated as **fire-and-log, not fire-and-forget**. Every notification attempt —
booking confirmation, 24-hour reminder, cancellation, leave notice, medication reminder — writes a
`NotificationLog` row up front with the outcome (`sent`/`retrying`/`failed`) and the attempt count.
A failed send never raises an exception into the booking/cancellation/notes flow — those endpoints
return success to the user as long as the *booking itself* succeeded, because a flaky email
provider shouldn't block a patient from securing an appointment.

Failures are retried out-of-band: `retry_failed_notifications`, another background job on the same
polling interval, picks up any log row in `retrying` status with `attempts < 5` and re-sends it,
incrementing the attempt counter each time and marking it `failed` (dead-lettered, visible for
manual follow-up) once the cap is hit. The same pattern covers LLM calls: `llm_service` wraps the
real Anthropic call in `tenacity` retries with exponential backoff, and on exhausted retries falls
back to a deterministic mock-based summary with `llm_failed=True` recorded on the row — so a
downstream outage degrades summary *quality*, never *availability* of the booking or visit-notes
flow. The same fire-and-log approach applies to Google Calendar event creation, which is wrapped
in a try/except that logs failures without blocking booking confirmation.
