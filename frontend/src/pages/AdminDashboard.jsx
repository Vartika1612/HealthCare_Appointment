import { useEffect, useState } from "react";
import api from "../api";
import Shell, { PulseDivider } from "../components/Shell";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AdminDashboard() {
  const [tab, setTab] = useState("doctors");
  return (
    <Shell>
      <div className="admin-layout">
        {/* Blue Left Navigation Sidebar matching screenshot */}
        <aside className="admin-sidebar">
          <div>
            <div style={{ color: "white", fontSize: "1.1rem", fontWeight: 800, marginBottom: 24, paddingLeft: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyCenter: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 4v16m-8-8h16" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
              Meridian Clinic
            </div>

            <nav className="sidebar-nav">
              <button 
                className={`sidebar-link ${tab === "doctors" ? "active" : ""}`}
                onClick={() => setTab("doctors")}
              >
                <span>👨‍⚕️</span> Doctors
              </button>
              <button 
                className={`sidebar-link ${tab === "new" ? "active" : ""}`}
                onClick={() => setTab("new")}
              >
                <span>➕</span> Add Doctor
              </button>
            </nav>
          </div>

          <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", paddingLeft: 8 }}>
            Admin Portal v2.4
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="admin-main">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: "1.75rem", color: "var(--ink-heading)" }}>Clinic Administration</h1>
              <p style={{ color: "var(--ink-muted)", fontSize: "0.95rem", marginTop: 4 }}>
                Manage doctor profiles, working hours, and leave days.
              </p>
            </div>
            {tab === "doctors" && (
              <button className="btn btn-primary" onClick={() => setTab("new")}>
                + Add Doctor
              </button>
            )}
          </div>

          {tab === "doctors" ? <DoctorList onAddClick={() => setTab("new")} /> : <NewDoctorForm onCreated={() => setTab("doctors")} />}
        </main>
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
          <div key={i} style={{ height: 60, background: "#F1F5F9", borderRadius: 8, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (doctors.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <strong style={{ fontSize: "1.1rem", display: "block", marginBottom: 6 }}>No doctors added yet</strong>
        <p style={{ color: "var(--ink-muted)", marginBottom: 16 }}>Create doctor profiles to configure availability and accept appointments.</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>Doctor</th>
            <th>Specialization</th>
            <th>Consultation</th>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {doctors.map((d) => (
            <>
              <tr key={d.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="avatar-circle" style={{ width: 40, height: 40 }}>
                      {d.full_name.replace("Dr. ", "").charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--ink-heading)" }}>{d.full_name}</div>
                      <div style={{ fontSize: "0.82rem", color: "var(--ink-muted)" }}>{d.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: "var(--ink-heading)" }}>{d.specialization}</span>
                </td>
                <td>
                  <div style={{ fontSize: "0.88rem", color: "var(--ink-heading)" }}>{d.slot_duration_minutes}-min slots</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>₹800 fee</div>
                </td>
                <td>
                  <span className={`tag ${d.active ? "tag-active" : "tag-high"}`}>
                    {d.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={() => toggleActive(d)}>
                      {d.active ? "Deactivate" : "Activate"}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={() => expand(d)}>
                      {expanded === d.id ? "Close" : "Manage Leave"}
                    </button>
                  </div>
                </td>
              </tr>

              {/* Leave management drawer */}
              {expanded === d.id && (
                <tr key={`${d.id}-leave`}>
                  <td colSpan={5} style={{ background: "#F8FAFC", padding: "20px 24px" }}>
                    <div style={{ maxWidth: 800 }}>
                      <h4 style={{ fontSize: "0.95rem", marginBottom: 12 }}>Leave Schedule — {d.full_name}</h4>
                      {error && <div className="error-banner">{error}</div>}

                      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: "0.8rem" }}>Leave Date</label>
                          <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
                        </div>
                        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                          <label style={{ fontSize: "0.8rem" }}>Reason (Optional)</label>
                          <input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="Conference, personal leave…" />
                        </div>
                        <button className="btn btn-primary" style={{ padding: "10px 16px" }} disabled={!leaveDate} onClick={() => addLeave(d.id)}>
                          Add Leave Day
                        </button>
                      </div>

                      <div style={{ background: "white", border: "1px solid var(--card-border)", borderRadius: 8, padding: 12 }}>
                        {(leaves[d.id] || []).length === 0 ? (
                          <div style={{ fontSize: "0.88rem", color: "var(--ink-muted)", textAlign: "center", padding: "8px" }}>
                            No upcoming leave days scheduled.
                          </div>
                        ) : (
                          (leaves[d.id] || []).map((l) => (
                            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}>
                              <div>
                                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{l.date}</span>
                                {l.reason && <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: "0.85rem" }}>({l.reason})</span>}
                              </div>
                              <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => removeLeave(d.id, l.id)}>
                                Delete
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
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
      <h3 style={{ fontSize: "1.2rem", marginBottom: 20 }}>Add New Doctor Profile</h3>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>

        <div className="grid-2">
          <div className="field">
            <label>Full Name</label>
            <input required placeholder="Dr. Jane Doe" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />
          </div>
          <div className="field">
            <label>Specialization</label>
            <input required placeholder="Cardiologist, Dermatologist…" value={form.specialization} onChange={(e) => update("specialization", e.target.value)} />
          </div>
          <div className="field">
            <label>Email Address</label>
            <input type="email" required placeholder="doctor@meridian.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="field">
            <label>Temporary Password</label>
            <input type="password" required minLength={8} value={form.password} onChange={(e) => update("password", e.target.value)} />
          </div>
          <div className="field">
            <label>Slot Duration (minutes)</label>
            <input type="number" min={10} step={5} value={form.slot_duration_minutes}
              onChange={(e) => update("slot_duration_minutes", Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Bio (Optional)</label>
            <input placeholder="Brief doctor profile statement" value={form.bio} onChange={(e) => update("bio", e.target.value)} />
          </div>
        </div>

        <label style={{ display: "block", fontSize: "0.88rem", color: "var(--ink-heading)", fontWeight: 700, margin: "12px 0 12px" }}>
          Weekly Working Hours
        </label>
        <div className="hours-grid">
          {hours.map((h, i) => (
            <div key={i} className={`hours-row ${!h.enabled ? "disabled" : ""}`}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={h.enabled} onChange={(e) => updateHour(i, "enabled", e.target.checked)} />
                <span style={{ fontWeight: 600 }}>{WEEKDAYS[i]}</span>
              </label>
              <input type="time" disabled={!h.enabled} value={h.start_time}
                onChange={(e) => updateHour(i, "start_time", e.target.value)} />
              <span className="hours-sep">–</span>
              <input type="time" disabled={!h.enabled} value={h.end_time}
                onChange={(e) => updateHour(i, "end_time", e.target.value)} />
            </div>
          ))}
        </div>

        <button className="btn btn-primary" disabled={busy} style={{ width: "100%", padding: "12px", marginTop: 8 }}>
          {busy ? <><span className="spinner" /> Creating Profile…</> : "Create Doctor Profile"}
        </button>
      </form>
    </div>
  );
}
