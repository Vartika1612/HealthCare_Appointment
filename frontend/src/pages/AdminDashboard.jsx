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

/* ─────────── Doctor List ─────────── */
function DoctorList() {
  const [doctors, setDoctors] = useState(null); // null = loading
  const [expanded, setExpanded] = useState(null);
  const [leaves, setLeaves] = useState({});
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [error, setError] = useState("");

  function load() {
    setDoctors(null);
    api.get("/api/admin/doctors").then((r) => setDoctors(r.data)).catch(() => setDoctors([]));
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

  /* Loading skeleton */
  if (doctors === null) {
    return (
      <div className="card">
        {[1, 2, 3].map(i => (
          <div key={i} style={{ padding: "18px 0", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skeleton" style={{ width: 150, height: 16 }} />
              <div className="skeleton" style={{ width: 100, height: 13 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="skeleton" style={{ width: 60, height: 32, borderRadius: 10 }} />
              <div className="skeleton" style={{ width: 100, height: 32, borderRadius: 10 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (doctors.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <strong>No doctors yet</strong>
          Add your first doctor profile from the "Add doctor" tab above.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {doctors.map((d, idx) => (
        <div key={d.id}>
          {/* Doctor row */}
          <div className="list-row" style={{ padding: "18px 28px" }}>
            <div>
              <div className="appt-name">{d.full_name}</div>
              <div className="appt-meta">{d.specialization} · {d.slot_duration_minutes}-min slots</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`tag ${d.active ? "tag-low" : "tag-high"}`}>
                {d.active ? "active" : "inactive"}
              </span>
              <button className="btn btn-ghost" style={{ padding: "7px 14px" }} onClick={() => toggleActive(d)}>
                {d.active ? "Deactivate" : "Activate"}
              </button>
              <button className="btn btn-ghost" style={{ padding: "7px 14px" }} onClick={() => expand(d)}>
                {expanded === d.id ? "Close ↑" : "Manage leave"}
              </button>
            </div>
          </div>

          {/* Leave management panel */}
          {expanded === d.id && (
            <div className="leave-panel">
              {error && <div className="error-banner">{error}</div>}

              <p style={{ fontSize: "0.83rem", color: "var(--ink-soft)", margin: "0 0 14px", lineHeight: 1.55 }}>
                Adding a leave day automatically cancels any booked appointments that day and emails affected patients.
              </p>

              {/* Add leave row */}
              <div className="leave-add-row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Leave date</label>
                  <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Reason <span style={{ fontWeight: 400 }}>(optional)</span></label>
                  <input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Conference, personal leave…" />
                </div>
                <button className="btn btn-primary" disabled={!leaveDate} onClick={() => addLeave(d.id)}
                  style={{ alignSelf: "flex-end" }}>
                  Add leave day
                </button>
              </div>

              {/* Leave list */}
              <div style={{ marginTop: 16 }}>
                {(leaves[d.id] || []).length === 0 ? (
                  <div className="empty-hint" style={{ padding: "16px" }}>
                    No leave days scheduled for {d.full_name.split(" ")[0]}.
                  </div>
                ) : (
                  (leaves[d.id] || []).map((l) => (
                    <div key={l.id} className="list-row" style={{ padding: "12px 0" }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "0.93rem" }}>{l.date}</span>
                        {l.reason && <span style={{ color: "var(--ink-soft)", marginLeft: 8, fontSize: "0.88rem" }}>— {l.reason}</span>}
                      </div>
                      <button className="btn btn-danger" style={{ padding: "6px 12px" }} onClick={() => removeLeave(d.id, l.id)}>
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {idx < doctors.length - 1 && <div style={{ borderBottom: "1px solid var(--line)", margin: "0 28px" }} />}
        </div>
      ))}
    </div>
  );
}

/* ─────────── Add Doctor Form ─────────── */
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

        {/* Basic info */}
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
            <label>Bio <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></label>
            <input value={form.bio} onChange={(e) => update("bio", e.target.value)} />
          </div>
        </div>

        {/* Working hours */}
        <label style={{ display: "block", fontSize: "0.83rem", color: "var(--ink-soft)", fontWeight: 600, margin: "8px 0 12px", letterSpacing: "0.01em" }}>
          Working hours
        </label>
        <div className="hours-grid">
          {hours.map((h, i) => (
            <div key={i} className={`hours-row ${!h.enabled ? "disabled" : ""}`}>
              <label>
                <input type="checkbox" checked={h.enabled} onChange={(e) => updateHour(i, "enabled", e.target.checked)} />
                {WEEKDAYS[i]}
              </label>
              <input type="time" disabled={!h.enabled} value={h.start_time}
                onChange={(e) => updateHour(i, "start_time", e.target.value)} />
              <span className="hours-sep">–</span>
              <input type="time" disabled={!h.enabled} value={h.end_time}
                onChange={(e) => updateHour(i, "end_time", e.target.value)} />
            </div>
          ))}
        </div>

        <button className="btn btn-primary" disabled={busy}>
          {busy ? <><span className="spinner" /> Creating…</> : "Create doctor profile"}
        </button>
      </form>
    </div>
  );
}
