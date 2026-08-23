import { useEffect, useState } from "react";
import api from "../api";
import Shell, { PulseDivider } from "../components/Shell";

const URGENCY_CLASS = { Low: "tag-low", Medium: "tag-medium", High: "tag-high" };

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [preVisit, setPreVisit] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [notesDraft, setNotesDraft] = useState({ clinical_notes: "", prescription_text: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [postVisit, setPostVisit] = useState(null);

  function load() {
    api.get("/api/appointments/doctor/mine").then((r) => setAppointments(r.data)).catch(() => {});
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

  const upcoming = appointments.filter((a) => a.status === "booked");
  const completed = appointments.filter((a) => a.status === "completed");

  return (
    <Shell>
      <div className="page">
        <div className="page-header">
          <h1>Today's patients</h1>
          <p>Each visit comes with an AI-prepared pre-visit summary so you can walk in informed.</p>
        </div>
        <PulseDivider />

        <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>Upcoming ({upcoming.length})</h2>
        <div className="card" style={{ marginBottom: 28 }}>
          {upcoming.length === 0 && <div className="empty-state">No upcoming appointments.</div>}
          {upcoming.map((a) => (
            <div key={a.id}>
              <div className="list-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{a.patient_name}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                    {new Date(a.slot_start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => expand(a)}>
                  {expanded === a.id ? "Hide" : "Open visit"}
                </button>
              </div>
              {expanded === a.id && (
                <div style={{ paddingBottom: 20 }}>
                  {error && <div className="error-banner">{error}</div>}
                  {preVisit[a.id] && (
                    <div style={{ background: "var(--mint)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      {preVisit[a.id].pre_visit_summary ? (
                        <>
                          <span className={`tag ${URGENCY_CLASS[preVisit[a.id].pre_visit_summary.urgency_level] || "tag-status"}`}>
                            {preVisit[a.id].pre_visit_summary.urgency_level} urgency
                          </span>
                          <p style={{ margin: "10px 0 8px", fontWeight: 500 }}>
                            {preVisit[a.id].pre_visit_summary.chief_complaint}
                          </p>
                          <p style={{ margin: "0 0 6px", fontSize: "0.85rem", fontWeight: 600 }}>Suggested questions</p>
                          <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: "0.9rem" }}>
                            {preVisit[a.id].pre_visit_summary.suggested_questions.map((q, i) => <li key={i}>{q}</li>)}
                          </ul>
                          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                            Patient's own words: "{preVisit[a.id].symptoms_text}"
                          </p>
                        </>
                      ) : (
                        <p style={{ margin: 0, fontSize: "0.9rem" }}>No symptom form submitted.</p>
                      )}
                    </div>
                  )}

                  {postVisit ? (
                    <div style={{ background: "var(--mint)", borderRadius: 10, padding: 16 }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>Visit completed — patient summary generated.</p>
                    </div>
                  ) : (
                    <>
                      <div className="field">
                        <label>Clinical notes</label>
                        <textarea rows={3} value={notesDraft.clinical_notes}
                          onChange={(e) => setNotesDraft((d) => ({ ...d, clinical_notes: e.target.value }))}
                          placeholder="Findings, diagnosis, reasoning…" />
                      </div>
                      <div className="field">
                        <label>Prescription (one medication per line: name, dosage, frequency)</label>
                        <textarea rows={3} value={notesDraft.prescription_text}
                          onChange={(e) => setNotesDraft((d) => ({ ...d, prescription_text: e.target.value }))}
                          placeholder={"Ibuprofen 400mg, twice daily\nParacetamol 500mg, once daily"} />
                      </div>
                      <button className="btn btn-primary" disabled={busy || !notesDraft.clinical_notes.trim()}
                        onClick={() => submitNotes(a.id)}>
                        {busy ? "Saving…" : "Complete visit & notify patient"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>Completed ({completed.length})</h2>
        <div className="card">
          {completed.length === 0 && <div className="empty-state">No completed visits yet.</div>}
          {completed.map((a) => (
            <div key={a.id} className="list-row">
              <div>
                <div style={{ fontWeight: 600 }}>{a.patient_name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                  {new Date(a.slot_start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
              <span className="tag tag-status">completed</span>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
