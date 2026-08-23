import { useEffect, useState } from "react";
import api from "../api";
import Shell, { PulseDivider } from "../components/Shell";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AdminDashboard() {
  const [tab, setTab] = useState("doctors");
  return (
    <Shell>
      <div className="page">
        <div className="page-header">
          <h1>Clinic administration</h1>
          <p>Manage doctor profiles, working hours, and leave.</p>
        </div>
        <PulseDivider />
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === "doctors" ? "active" : ""}`} onClick={() => setTab("doctors")}>Doctors</button>
          <button className={`nav-tab ${tab === "new" ? "active" : ""}`} onClick={() => setTab("new")}>Add doctor</button>
        </div>
        {tab === "doctors" ? <DoctorList /> : <NewDoctorForm onCreated={() => setTab("doctors")} />}
      </div>
    </Shell>
  );
}

function DoctorList() {
  const [doctors, setDoctors] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [leaves, setLeaves] = useState({});
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.get("/api/admin/doctors").then((r) => setDoctors(r.data)).catch(() => {});
  }
  useEffect(load, []);

  async function expand(d) {
    if (expanded === d.id) { setExpanded(null); return; }
    setExpanded(d.id);
    setError("");
    const { data } = await api.get(`/api/admin/doctors/${d.id}/leaves`);
    setLeaves((l) => ({ ...l, [d.id]: data }));
  }

  async function addLeave(doctorId) {
    setError("");
    try {
      await api.post(`/api/admin/doctors/${doctorId}/leaves`, { date: leaveDate, reason: leaveReason });
      const { data } = await api.get(`/api/admin/doctors/${doctorId}/leaves`);
      setLeaves((l) => ({ ...l, [doctorId]: data }));
      setLeaveDate(""); setLeaveReason("");
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't add leave day.");
    }
  }

  async function removeLeave(doctorId, leaveId) {
    await api.delete(`/api/admin/doctors/${doctorId}/leaves/${leaveId}`);
    const { data } = await api.get(`/api/admin/doctors/${doctorId}/leaves`);
    setLeaves((l) => ({ ...l, [doctorId]: data }));
  }

  async function toggleActive(d) {
    await api.put(`/api/admin/doctors/${d.id}`, { active: !d.active });
    load();
  }

  return (
    <div className="card">
      {doctors.length === 0 && <div className="empty-state">No doctors yet — add one from the tab above.</div>}
      {doctors.map((d) => (
        <div key={d.id}>
          <div className="list-row">
            <div>
              <div style={{ fontWeight: 600 }}>{d.full_name}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                {d.specialization} · {d.slot_duration_minutes}-minute slots
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="tag tag-status">{d.active ? "active" : "inactive"}</span>
              <button className="btn btn-ghost" onClick={() => toggleActive(d)}>
                {d.active ? "Deactivate" : "Activate"}
              </button>
              <button className="btn btn-ghost" onClick={() => expand(d)}>
                {expanded === d.id ? "Hide" : "Manage leave"}
              </button>
            </div>
          </div>
          {expanded === d.id && (
            <div style={{ paddingBottom: 20 }}>
              {error && <div className="error-banner">{error}</div>}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 14 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Leave date</label>
                  <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Reason (optional)</label>
                  <input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="Conference, personal leave…" />
                </div>
                <button className="btn btn-primary" disabled={!leaveDate} onClick={() => addLeave(d.id)}>
                  Add leave
                </button>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginBottom: 10 }}>
                Adding a leave day automatically cancels any booked appointments that day and emails the affected patients.
              </p>
              {(leaves[d.id] || []).length === 0 ? (
                <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)" }}>No leave days scheduled.</p>
              ) : (
                (leaves[d.id] || []).map((l) => (
                  <div key={l.id} className="list-row">
                    <span>{l.date} {l.reason && `— ${l.reason}`}</span>
                    <button className="btn btn-danger" onClick={() => removeLeave(d.id, l.id)}>Remove</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NewDoctorForm({ onCreated }) {
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", specialization: "", slot_duration_minutes: 30, bio: "",
  });
  const [hours, setHours] = useState(
    WEEKDAYS.map((_, i) => ({ weekday: i, enabled: i < 5, start_time: "09:00", end_time: "17:00" }))
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function updateHour(i, field, value) {
    setHours((h) => h.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const working_hours = hours
        .filter((h) => h.enabled)
        .map((h) => ({ weekday: h.weekday, start_time: `${h.start_time}:00`, end_time: `${h.end_time}:00` }));
      await api.post("/api/admin/doctors", { ...form, working_hours });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't create doctor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="grid-2">
          <div className="field">
            <label>Full name</label>
            <input required value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />
          </div>
          <div className="field">
            <label>Specialization</label>
            <input required value={form.specialization} onChange={(e) => update("specialization", e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="field">
            <label>Temporary password</label>
            <input type="password" required minLength={8} value={form.password} onChange={(e) => update("password", e.target.value)} />
          </div>
          <div className="field">
            <label>Slot duration (minutes)</label>
            <input type="number" min={10} step={5} value={form.slot_duration_minutes}
              onChange={(e) => update("slot_duration_minutes", Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Bio (optional)</label>
            <input value={form.bio} onChange={(e) => update("bio", e.target.value)} />
          </div>
        </div>

        <label style={{ display: "block", fontSize: "0.82rem", color: "var(--ink-soft)", fontWeight: 500, margin: "10px 0 8px" }}>
          Working hours
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {hours.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ width: 90, display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem" }}>
                <input type="checkbox" checked={h.enabled} onChange={(e) => updateHour(i, "enabled", e.target.checked)} />
                {WEEKDAYS[i]}
              </label>
              <input type="time" disabled={!h.enabled} value={h.start_time} onChange={(e) => updateHour(i, "start_time", e.target.value)} style={{ width: 120 }} />
              <span style={{ color: "var(--ink-soft)" }}>to</span>
              <input type="time" disabled={!h.enabled} value={h.end_time} onChange={(e) => updateHour(i, "end_time", e.target.value)} style={{ width: 120 }} />
            </div>
          ))}
        </div>

        <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create doctor profile"}</button>
      </form>
    </div>
  );
}
