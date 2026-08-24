import { useEffect, useState } from "react";
import api from "../api";
import Shell, { PulseDivider } from "../components/Shell";

const URGENCY_CLASS = { Low: "tag-low", Medium: "tag-medium", High: "tag-high" };

export default function PatientDashboard() {
  const [tab, setTab] = useState("book");

  return (
    <Shell>
      <div className="page">
        {/* Blue Hero Banner */}
        <div className="hero-card">
          <div className="hero-content">
            <h1>Your care, on your schedule</h1>
            <p>Book with a specialist, share your symptoms ahead of time, and get a plain-language summary after every visit.</p>
            <div style={{ display: "flex", gap: 12 }}>
              <button 
                className={`btn ${tab === "book" ? "btn-primary" : "btn-ghost"}`} 
                onClick={() => setTab("book")}
              >
                Book an appointment
              </button>
              <button 
                className={`btn ${tab === "mine" ? "btn-primary" : "btn-ghost"}`} 
                onClick={() => setTab("mine")}
              >
                My appointments
              </button>
            </div>
          </div>
          <svg className="hero-illustration" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="80" fill="#3B82F6" fillOpacity="0.1"/>
            <path d="M70 130C70 113.431 83.4315 100 100 100C116.569 100 130 113.431 130 130" stroke="#2563EB" strokeWidth="8" strokeLinecap="round"/>
            <circle cx="100" cy="70" r="24" stroke="#2563EB" strokeWidth="8"/>
            <path d="M140 60L160 80L140 100" stroke="#60A5FA" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
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
  const [slots, setSlots] = useState([]);
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
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", color: "#166534" }}>✓</div>
          <div>
            <h2 style={{ fontSize: "1.35rem" }}>Appointment Confirmed!</h2>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.95rem", margin: "4px 0 0" }}>
              A confirmation email and calendar invite have been sent to your email.
            </p>
          </div>
        </div>
        {s && (
          <div className="info-box">
            <div style={{ marginBottom: 12 }}>
              <span className={`tag ${URGENCY_CLASS[s.urgency_level] || "tag-status"}`}>{s.urgency_level} urgency</span>
            </div>
            <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: "1rem" }}>Chief Complaint: {s.chief_complaint}</p>
            <p style={{ margin: "0 0 8px", fontSize: "0.88rem", color: "var(--ink-muted)", fontWeight: 700 }}>Questions your doctor may ask:</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.92rem", lineHeight: 1.6 }}>
              {s.suggested_questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onBooked}>
          Go to My Appointments →
        </button>
      </div>
    );
  }

  /* ── Step: symptoms ── */
  if (step === "symptoms") {
    return (
      <div className="card">
        <h2 style={{ fontSize: "1.3rem", marginBottom: 8 }}>3 · Share symptoms ahead of time</h2>
        <p style={{ color: "var(--ink-muted)", marginBottom: 24, fontSize: "0.95rem", lineHeight: 1.6 }}>
          Your doctor will see an AI-prepared summary before your visit. This helps make your appointment focused and efficient.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="symptoms">Describe how you're feeling or what symptoms you have</label>
          <textarea id="symptoms" rows={5} value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="e.g. Dull headache for two days, worse in the evenings, no fever." />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => setStep("search")}>← Back</button>
          <button className="btn btn-primary" disabled={busy || !symptoms.trim()} onClick={submitSymptomsAndConfirm}>
            {busy ? <><span className="spinner" /> Confirming…</> : "Confirm Appointment"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Step: search ── */
  return (
    <div>
      {/* 4-Step Process Bar matching prompt */}
      <div className="step-bar">
        <div className={`step-item ${doctorId ? "" : "active"}`}>
          <div className="step-num">1</div>
          <span>Find a doctor</span>
        </div>
        <span className="step-arrow">→</span>
        <div className={`step-item ${doctorId && !selectedSlot ? "active" : ""}`}>
          <div className="step-num">2</div>
          <span>Pick a time</span>
        </div>
        <span className="step-arrow">→</span>
        <div className="step-item">
          <div className="step-num">3</div>
          <span>Share symptoms</span>
        </div>
        <span className="step-arrow">→</span>
        <div className="step-item">
          <div className="step-num">4</div>
          <span>Get summary</span>
        </div>
      </div>

      <div className="grid-2">
        {/* Left card: find a doctor */}
        <div className="card">
          <h2 style={{ fontSize: "1.15rem", marginBottom: 18 }}>1. Find a doctor</h2>
          {error && <div className="error-banner">{error}</div>}

          {/* Quick Specialization Pills */}
          <div style={{ marginBottom: 20 }}>
            <label className="field" style={{ marginBottom: 8, display: "block" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink-heading)" }}>Specialization</span>
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button 
                type="button"
                className={`btn ${specialization === "" ? "btn-primary" : "btn-ghost"}`}
                style={{ padding: "6px 14px", fontSize: "0.82rem", borderRadius: 999 }}
                onClick={() => setSpecialization("")}
              >
                All Specializations
              </button>
              {specializations.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn ${specialization === s ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "6px 14px", fontSize: "0.82rem", borderRadius: 999 }}
                  onClick={() => setSpecialization(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {doctorsLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 64, background: "#F1F5F9", borderRadius: 12 }} />
              ))}
            </div>
          )}

          {!doctorsLoading && doctors.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-muted)", border: "1.5px dashed var(--card-border)", borderRadius: 12 }}>
              <strong style={{ display: "block", color: "var(--ink-heading)", marginBottom: 4 }}>No doctors found</strong>
              Try selecting a different specialization above.
            </div>
          )}

          {!doctorsLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {doctors.map((d) => (
                <div
                  key={d.id}
                  onClick={() => setDoctorId(d.id)}
                  className={`doctor-card ${doctorId === d.id ? "selected" : ""}`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div className="avatar-circle" style={{ width: 44, height: 44, fontSize: "1.1rem" }}>
                      {d.full_name.replace("Dr. ", "").charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--ink-heading)" }}>{d.full_name}</div>
                      <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)", marginTop: 2 }}>{d.specialization} · {d.slot_duration_minutes} min</div>
                    </div>
                  </div>
                  <button className={`btn ${doctorId === d.id ? "btn-primary" : "btn-ghost"}`} style={{ padding: "6px 14px", fontSize: "0.83rem" }}>
                    {doctorId === d.id ? "Selected" : "Select"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right card: pick a time */}
        <div className="card">
          <h2 style={{ fontSize: "1.15rem", marginBottom: 18 }}>2. Pick a time</h2>
          <div className="field">
            <label htmlFor="date">Appointment Date</label>
            <input id="date" type="date" value={date} min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)} />
          </div>

          {!doctorId && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-muted)", border: "1.5px dashed var(--card-border)", borderRadius: 12 }}>
              Choose a doctor on the left to view available slots.
            </div>
          )}

          {doctorId && slotsLoading && (
            <div className="slot-grid">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} style={{ height: 44, background: "#F1F5F9", borderRadius: 8 }} />
              ))}
            </div>
          )}

          {doctorId && !slotsLoading && slots.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-muted)", border: "1.5px dashed var(--card-border)", borderRadius: 12 }}>
              <strong style={{ display: "block", color: "var(--ink-heading)", marginBottom: 4 }}>No slots available</strong>
              Try picking another date.
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
            <button className="btn btn-primary" style={{ marginTop: 24, width: "100%", padding: "12px" }}
              disabled={!selectedSlot || busy} onClick={holdSlot}>
              {busy ? <><span className="spinner" /> Holding slot…</> : "Hold this slot →"}
            </button>
          )}
        </div>
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
