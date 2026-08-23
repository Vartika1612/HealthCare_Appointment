import { useEffect, useState } from "react";
import api from "../api";
import Shell, { PulseDivider } from "../components/Shell";

const URGENCY_CLASS = { Low: "tag-low", Medium: "tag-medium", High: "tag-high" };

export default function PatientDashboard() {
  const [tab, setTab] = useState("book");

  return (
    <Shell>
      <div className="page">
        <div className="page-header">
          <h1>Your care, on your schedule</h1>
          <p>Book with a specialist, share your symptoms ahead of time, and get a plain-language summary after every visit.</p>
        </div>
        <PulseDivider />
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === "book" ? "active" : ""}`} onClick={() => setTab("book")}>Book an appointment</button>
          <button className={`nav-tab ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>My appointments</button>
        </div>
        {tab === "book" ? <BookingFlow onBooked={() => setTab("mine")} /> : <MyAppointments />}
      </div>
    </Shell>
  );
}

/* ─────────── Booking flow ─────────── */
function BookingFlow({ onBooked }) {
  const [specializations, setSpecializations] = useState([]);
  const [specialization, setSpecialization] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [doctorId, setDoctorId] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState([]); // null = loading
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [step, setStep] = useState("search"); // search → symptoms → done
  const [appointmentId, setAppointmentId] = useState(null);
  const [symptoms, setSymptoms] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);

  useEffect(() => {
    api.get("/api/doctors/specializations").then((r) => setSpecializations(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setDoctorsLoading(true);
    api.get("/api/doctors", { params: specialization ? { specialization } : {} })
      .then((r) => setDoctors(r.data))
      .catch(() => {})
      .finally(() => setDoctorsLoading(false));
    setDoctorId(null);
    setSlots([]);
    setSelectedSlot(null);
  }, [specialization]);

  useEffect(() => {
    if (!doctorId) { setSlots([]); return; }
    setSlotsLoading(true);
    api.get(`/api/doctors/${doctorId}/slots`, { params: { date } })
      .then((r) => setSlots(r.data))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
    setSelectedSlot(null);
  }, [doctorId, date]);

  async function holdSlot() {
    setError(""); setBusy(true);
    try {
      const { data } = await api.post("/api/appointments/hold", {
        doctor_id: doctorId, slot_start: selectedSlot,
      });
      setAppointmentId(data.appointment_id);
      setStep("symptoms");
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't hold that slot. Please try another.");
      if (doctorId) api.get(`/api/doctors/${doctorId}/slots`, { params: { date } }).then((r) => setSlots(r.data));
    } finally {
      setBusy(false);
    }
  }

  async function submitSymptomsAndConfirm() {
    setError(""); setBusy(true);
    try {
      await api.post(`/api/appointments/${appointmentId}/symptoms`, { symptoms_text: symptoms });
      const { data } = await api.post(`/api/appointments/${appointmentId}/confirm`);
      setConfirmResult(data);
      setStep("done");
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't confirm your booking. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /* ── Step: done ── */
  if (step === "done" && confirmResult) {
    const s = confirmResult.pre_visit_summary;
    return (
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--mint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>✓</div>
          <div>
            <h2 style={{ fontSize: "1.25rem" }}>Appointment confirmed</h2>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", margin: "2px 0 0" }}>
              A confirmation email and calendar invite are on their way.
            </p>
          </div>
        </div>
        {s && (
          <div className="info-box">
            <div style={{ marginBottom: 10 }}>
              <span className={`tag ${URGENCY_CLASS[s.urgency_level] || "tag-status"}`}>{s.urgency_level} urgency</span>
            </div>
            <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{s.chief_complaint}</p>
            <p style={{ margin: "0 0 6px", fontSize: "0.85rem", color: "var(--ink-soft)", fontWeight: 600 }}>Questions your doctor may ask:</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.9rem", lineHeight: 1.6 }}>
              {s.suggested_questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}
        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={onBooked}>
          Go to my appointments
        </button>
      </div>
    );
  }

  /* ── Step: symptoms ── */
  if (step === "symptoms") {
    return (
      <div className="card">
        <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Tell us what's going on</h2>
        <p style={{ color: "var(--ink-soft)", marginBottom: 22, fontSize: "0.92rem", lineHeight: 1.6 }}>
          Your doctor will see an AI-prepared summary before your visit. This isn't a diagnosis — just a heads-up to make your appointment more focused.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="symptoms">Describe your symptoms</label>
          <textarea id="symptoms" rows={5} value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="e.g. Dull headache for two days, worse in the evenings, no fever." />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setStep("search")}>← Back</button>
          <button className="btn btn-primary" disabled={busy || !symptoms.trim()} onClick={submitSymptomsAndConfirm}>
            {busy ? <><span className="spinner" /> Confirming…</> : "Confirm appointment"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Step: search ── */
  return (
    <div className="grid-2">
      {/* Left card: find a doctor */}
      <div className="card">
        <h2 style={{ fontSize: "1.05rem", marginBottom: 18 }}>1 · Find a doctor</h2>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Specialization</label>
          <select value={specialization} onChange={(e) => setSpecialization(e.target.value)}>
            <option value="">All specializations</option>
            {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {doctorsLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: 58, borderRadius: 9 }} />
            ))}
          </div>
        )}

        {!doctorsLoading && doctors.length === 0 && (
          <div className="empty-hint">
            <strong style={{ display: "block", color: "var(--ink)", marginBottom: 4 }}>No doctors found</strong>
            Try a different specialization or check back later.
          </div>
        )}

        {!doctorsLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {doctors.map((d) => (
              <button
                key={d.id}
                onClick={() => setDoctorId(d.id)}
                className={`slot-btn ${doctorId === d.id ? "selected" : ""}`}
                style={{ textAlign: "left", padding: "14px 16px", borderRadius: 9 }}
              >
                <div className="appt-name" style={{ color: doctorId === d.id ? "white" : undefined }}>{d.full_name}</div>
                <div className="appt-meta" style={{ color: doctorId === d.id ? "rgba(255,255,255,0.75)" : undefined }}>{d.specialization}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right card: pick a time */}
      <div className="card">
        <h2 style={{ fontSize: "1.05rem", marginBottom: 18 }}>2 · Pick a time</h2>
        <div className="field">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)} />
        </div>

        {!doctorId && (
          <div className="empty-hint">Choose a doctor on the left to see available slots.</div>
        )}

        {doctorId && slotsLoading && (
          <div className="slot-grid">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="skeleton" style={{ height: 42 }} />
            ))}
          </div>
        )}

        {doctorId && !slotsLoading && slots.length === 0 && (
          <div className="empty-hint">
            <strong style={{ display: "block", color: "var(--ink)", marginBottom: 4 }}>No slots available</strong>
            Try a different date.
          </div>
        )}

        <div className="slot-grid">
          {slots.map((s) => (
            <button
              key={s.start}
              className={`slot-btn ${selectedSlot === s.start ? "selected" : ""}`}
              onClick={() => setSelectedSlot(s.start)}
            >
              {new Date(s.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </button>
          ))}
        </div>

        {doctorId && slots.length > 0 && (
          <button className="btn btn-primary" style={{ marginTop: 20 }}
            disabled={!selectedSlot || busy} onClick={holdSlot}>
            {busy ? <><span className="spinner" /> Holding slot…</> : "Hold this slot →"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────── My Appointments ─────────── */
function MyAppointments() {
  const [appointments, setAppointments] = useState(null); // null = loading
  const [summaries, setSummaries] = useState({});
  const [error, setError] = useState("");

  function load() {
    setAppointments(null);
    api.get("/api/appointments/mine").then((r) => setAppointments(r.data)).catch(() => setAppointments([]));
  }

  useEffect(load, []);

  async function cancel(id) {
    setError("");
    try {
      await api.post(`/api/appointments/${id}/cancel`);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't cancel this appointment.");
    }
  }

  async function viewSummary(id) {
    try {
      const { data } = await api.get(`/api/appointments/${id}/post-visit-summary`);
      setSummaries((s) => ({ ...s, [id]: data }));
    } catch {
      setSummaries((s) => ({ ...s, [id]: null }));
    }
  }

  /* Loading skeleton */
  if (appointments === null) {
    return (
      <div className="card">
        {[1, 2, 3].map(i => (
          <div key={i} style={{ padding: "18px 0", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skeleton" style={{ width: 180, height: 16 }} />
              <div className="skeleton" style={{ width: 120, height: 13 }} />
            </div>
            <div className="skeleton" style={{ width: 72, height: 30, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <strong>No appointments yet</strong>
          Use "Book an appointment" above to schedule your first visit.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      {appointments.map((a) => (
        <div key={a.id}>
          <div className="list-row">
            <div>
              <div className="appt-name">{a.doctor_name} · <span style={{ fontWeight: 400 }}>{a.specialization}</span></div>
              <div className="appt-meta">
                {new Date(a.slot_start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={`tag ${a.status === "cancelled" ? "tag-high" : a.status === "completed" ? "tag-low" : "tag-status"}`}>
                {a.status}
              </span>
              {a.status === "booked" && (
                <button className="btn btn-danger" style={{ padding: "7px 14px" }} onClick={() => cancel(a.id)}>Cancel</button>
              )}
              {a.status === "completed" && (
                <button className="btn btn-ghost" style={{ padding: "7px 14px" }} onClick={() => viewSummary(a.id)}>Visit summary</button>
              )}
            </div>
          </div>

          {summaries[a.id] !== undefined && (
            <div className="info-box" style={{ marginTop: -4, marginBottom: 8 }}>
              {summaries[a.id] ? (
                <>
                  <p style={{ margin: "0 0 12px", lineHeight: 1.6 }}>{summaries[a.id].patient_summary_text}</p>
                  <p style={{ margin: "0 0 6px", fontSize: "0.85rem", fontWeight: 700 }}>Medication schedule</p>
                  <ul style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: "0.9rem", lineHeight: 1.65 }}>
                    {summaries[a.id].medication_schedule.map((m, i) => (
                      <li key={i}>{m.medication} — {m.dosage}, {m.frequency}</li>
                    ))}
                  </ul>
                  <p style={{ margin: 0, fontSize: "0.9rem" }}>{summaries[a.id].follow_up_steps}</p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-soft)" }}>No summary available yet.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
