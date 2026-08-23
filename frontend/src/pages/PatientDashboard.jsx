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

function BookingFlow({ onBooked }) {
  const [specializations, setSpecializations] = useState([]);
  const [specialization, setSpecialization] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [step, setStep] = useState("search"); // search -> symptoms -> done
  const [appointmentId, setAppointmentId] = useState(null);
  const [symptoms, setSymptoms] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);

  useEffect(() => {
    api.get("/api/doctors/specializations").then((r) => setSpecializations(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/api/doctors", { params: specialization ? { specialization } : {} })
      .then((r) => setDoctors(r.data)).catch(() => {});
    setDoctorId(null);
    setSlots([]);
    setSelectedSlot(null);
  }, [specialization]);

  useEffect(() => {
    if (!doctorId) { setSlots([]); return; }
    api.get(`/api/doctors/${doctorId}/slots`, { params: { date } })
      .then((r) => setSlots(r.data)).catch(() => setSlots([]));
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

  if (step === "done" && confirmResult) {
    const s = confirmResult.pre_visit_summary;
    return (
      <div className="card">
        <h2 style={{ fontSize: "1.3rem", marginBottom: 6 }}>Appointment confirmed</h2>
        <p style={{ color: "var(--ink-soft)", marginBottom: 16 }}>
          A confirmation email and calendar invite are on their way to you and your doctor.
        </p>
        {s && (
          <div style={{ background: "var(--mint)", borderRadius: 10, padding: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <span className={`tag ${URGENCY_CLASS[s.urgency_level] || "tag-status"}`}>{s.urgency_level} urgency</span>
            </div>
            <p style={{ margin: "0 0 10px", fontWeight: 500 }}>{s.chief_complaint}</p>
            <p style={{ margin: "0 0 6px", fontSize: "0.85rem", color: "var(--ink-soft)" }}>Questions your doctor may ask:</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.9rem" }}>
              {s.suggested_questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}
        <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onBooked}>
          Go to my appointments
        </button>
      </div>
    );
  }

  if (step === "symptoms") {
    return (
      <div className="card">
        <h2 style={{ fontSize: "1.2rem", marginBottom: 4 }}>Tell us what's going on</h2>
        <p style={{ color: "var(--ink-soft)", marginBottom: 16, fontSize: "0.9rem" }}>
          Your doctor will see an AI-prepared summary of this before your visit. This isn't a diagnosis —
          just a heads-up to make your appointment more focused.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="symptoms">Describe your symptoms</label>
          <textarea id="symptoms" rows={5} value={symptoms} onChange={(e) => setSymptoms(e.target.value)}
            placeholder="e.g. Dull headache for two days, worse in the evenings, no fever." />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setStep("search")}>Back</button>
          <button className="btn btn-primary" disabled={busy || !symptoms.trim()} onClick={submitSymptomsAndConfirm}>
            {busy ? "Confirming…" : "Confirm appointment"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: 14 }}>1. Find a doctor</h2>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Specialization</label>
          <select value={specialization} onChange={(e) => setSpecialization(e.target.value)}>
            <option value="">All specializations</option>
            {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {doctors.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>No doctors found.</p>}
          {doctors.map((d) => (
            <button
              key={d.id}
              onClick={() => setDoctorId(d.id)}
              className="slot-btn"
              style={{ textAlign: "left", padding: "12px 14px" }}
              data-selected={doctorId === d.id}
            >
              <div style={{ fontWeight: 600, color: doctorId === d.id ? undefined : "var(--ink)" }}>{d.full_name}</div>
              <div style={{ fontSize: "0.82rem", opacity: 0.85 }}>{d.specialization}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: 14 }}>2. Pick a time</h2>
        <div className="field">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        {!doctorId && <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>Choose a doctor first.</p>}
        {doctorId && slots.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>No slots available that day — try another date.</p>}
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
        <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={!selectedSlot || busy} onClick={holdSlot}>
          {busy ? "Holding slot…" : "Hold this slot"}
        </button>
      </div>
    </div>
  );
}

function MyAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [error, setError] = useState("");

  function load() {
    api.get("/api/appointments/mine").then((r) => setAppointments(r.data)).catch(() => {});
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

  if (appointments.length === 0) {
    return <div className="card empty-state">No appointments yet. Book one from the tab above.</div>;
  }

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      {appointments.map((a) => (
        <div key={a.id}>
          <div className="list-row">
            <div>
              <div style={{ fontWeight: 600 }}>{a.doctor_name} · {a.specialization}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                {new Date(a.slot_start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="tag tag-status">{a.status}</span>
              {a.status === "booked" && <button className="btn btn-danger" onClick={() => cancel(a.id)}>Cancel</button>}
              {a.status === "completed" && <button className="btn btn-ghost" onClick={() => viewSummary(a.id)}>Visit summary</button>}
            </div>
          </div>
          {summaries[a.id] !== undefined && (
            <div style={{ background: "var(--mint)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              {summaries[a.id] ? (
                <>
                  <p style={{ margin: "0 0 10px" }}>{summaries[a.id].patient_summary_text}</p>
                  <p style={{ margin: "0 0 6px", fontSize: "0.85rem", fontWeight: 600 }}>Medication schedule</p>
                  <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: "0.9rem" }}>
                    {summaries[a.id].medication_schedule.map((m, i) => (
                      <li key={i}>{m.medication} — {m.dosage}, {m.frequency}</li>
                    ))}
                  </ul>
                  <p style={{ margin: 0, fontSize: "0.9rem" }}>{summaries[a.id].follow_up_steps}</p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "0.9rem" }}>No summary available yet.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
