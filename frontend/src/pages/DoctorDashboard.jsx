import { useEffect, useState } from "react";
import api from "../api";
import Shell, { PulseDivider } from "../components/Shell";

const URGENCY_CLASS = { Low: "tag-low", Medium: "tag-medium", High: "tag-high" };

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState(null); // null = loading
  const [preVisit, setPreVisit] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [notesDraft, setNotesDraft] = useState({ clinical_notes: "", prescription_text: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [postVisit, setPostVisit] = useState(null);

  function load() {
    setAppointments(null);
    api.get("/api/appointments/doctor/mine")
      .then((r) => setAppointments(r.data))
      .catch(() => setAppointments([]));
  }
  useEffect(load, []);

  async function expand(a) {
    if (expanded === a.id) { setExpanded(null); return; }
    setExpanded(a.id);
    setPostVisit(null);
    if (!preVisit[a.id]) {
      const { data } = await api.get(`/api/appointments/${a.id}/pre-visit-summary`);
      setPreVisit((p) => ({ ...p, [a.id]: data }));
    }
    setNotesDraft({ clinical_notes: "", prescription_text: "" });
  }

  async function submitNotes(appointmentId) {
    setError(""); setBusy(true);
    try {
      const { data } = await api.post(`/api/appointments/${appointmentId}/notes`, notesDraft);
      setPostVisit(data.post_visit_summary);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't save your notes.");
    } finally {
      setBusy(false);
    }
  }

  const upcoming  = (appointments || []).filter((a) => a.status === "booked");
  const completed = (appointments || []).filter((a) => a.status === "completed");

  /* Skeleton loader */
  if (appointments === null) {
    return (
      <Shell>
        <div className="page">
          <div className="page-header">
            <h1>Today's patients</h1>
            <p>Each visit comes with an AI-prepared pre-visit summary so you can walk in informed.</p>
          </div>
          <PulseDivider />
          <div className="card" style={{ marginBottom: 28 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ padding: "18px 0", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="skeleton" style={{ width: 160, height: 16 }} />
                  <div className="skeleton" style={{ width: 110, height: 13 }} />
                </div>
                <div className="skeleton" style={{ width: 80, height: 34, borderRadius: 10 }} />
              </div>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="page">
        <div className="page-header">
          <h1>Today's patients</h1>
          <p>Each visit comes with an AI-prepared pre-visit summary so you can walk in informed.</p>
        </div>
        <PulseDivider />

        {/* Upcoming */}
        <p className="section-heading">
          Upcoming
          <span className="count">{upcoming.length}</span>
        </p>
        <div className="card" style={{ marginBottom: 36 }}>
          {upcoming.length === 0 && (
            <div className="empty-state">
              <strong>No upcoming appointments</strong>
              Your schedule is clear — enjoy the breathing room.
            </div>
          )}
          {upcoming.map((a) => (
            <div key={a.id}>
              <div className="list-row">
                <div>
                  <div className="appt-name">{a.patient_name}</div>
                  <div className="appt-meta">
                    {new Date(a.slot_start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => expand(a)}>
                  {expanded === a.id ? "Close" : "Open visit"}
                </button>
              </div>

              {expanded === a.id && (
                <div style={{ paddingBottom: 24, paddingTop: 4 }}>
                  {error && <div className="error-banner">{error}</div>}

                  {/* Pre-visit summary */}
                  {preVisit[a.id] && (
                    <div className="info-box">
                      {preVisit[a.id].pre_visit_summary ? (
                        <>
                          <div style={{ marginBottom: 10 }}>
                            <span className={`tag ${URGENCY_CLASS[preVisit[a.id].pre_visit_summary.urgency_level] || "tag-status"}`}>
                              {preVisit[a.id].pre_visit_summary.urgency_level} urgency
                            </span>
                          </div>
                          <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: "0.97rem" }}>
                            {preVisit[a.id].pre_visit_summary.chief_complaint}
                          </p>
                          <p style={{ margin: "0 0 6px", fontSize: "0.83rem", fontWeight: 700, color: "var(--ink-soft)" }}>
                            SUGGESTED QUESTIONS
                          </p>
                          <ul style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: "0.9rem", lineHeight: 1.65 }}>
                            {preVisit[a.id].pre_visit_summary.suggested_questions.map((q, i) => <li key={i}>{q}</li>)}
                          </ul>
                          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                            Patient's words: "{preVisit[a.id].symptoms_text}"
                          </p>
                        </>
                      ) : (
                        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-soft)" }}>No symptom form submitted by patient.</p>
                      )}
                    </div>
                  )}

                  {/* Notes / completion */}
                  {postVisit ? (
                    <div className="info-box" style={{ background: "#E6F3EA", borderColor: "#c4dece" }}>
                      <p style={{ margin: 0, fontWeight: 600, color: "var(--green)" }}>✓ Visit completed — patient summary generated and sent.</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ borderTop: "1px solid var(--line)", margin: "8px 0 20px" }} />
                      <div className="field">
                        <label>Clinical notes</label>
                        <textarea rows={4} value={notesDraft.clinical_notes}
                          onChange={(e) => setNotesDraft((d) => ({ ...d, clinical_notes: e.target.value }))}
                          placeholder="Findings, diagnosis, reasoning…" />
                      </div>
                      <div className="field">
                        <label>Prescription <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(one medication per line: name, dosage, frequency)</span></label>
                        <textarea rows={3} value={notesDraft.prescription_text}
                          onChange={(e) => setNotesDraft((d) => ({ ...d, prescription_text: e.target.value }))}
                          placeholder={"Ibuprofen 400mg, twice daily\nParacetamol 500mg, once daily"} />
                      </div>
                      <button className="btn btn-primary"
                        disabled={busy || !notesDraft.clinical_notes.trim()}
                        onClick={() => submitNotes(a.id)}>
                        {busy ? <><span className="spinner" /> Saving…</> : "Complete visit & notify patient"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Completed */}
        <p className="section-heading">
          Completed
          <span className="count">{completed.length}</span>
        </p>
        <div className="card">
          {completed.length === 0 && (
            <div className="empty-state">
              <strong>No completed visits yet</strong>
              Completed appointments will appear here.
            </div>
          )}
          {completed.map((a) => (
            <div key={a.id} className="list-row">
              <div>
                <div className="appt-name">{a.patient_name}</div>
                <div className="appt-meta">
                  {new Date(a.slot_start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
              <span className="tag tag-low">completed</span>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
