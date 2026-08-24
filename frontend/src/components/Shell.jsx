import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "../api";

export default function Shell({ children }) {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [calendarConnected, setCalendarConnected] = useState(false);

  useEffect(() => {
    if (auth && auth.role !== "admin") {
      api.get("/api/calendar/status").then(r => setCalendarConnected(r.data.connected)).catch(() => {});
    }
  }, [auth]);

  async function connectCalendar() {
    try {
      const r = await api.get("/api/calendar/authorize");
      if (r.data.auth_url) {
        window.location.href = r.data.auth_url;
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      alert(detail || "Failed to start calendar authorization");
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M2 12h5l2-7 4 14 2-7h7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="brand-name">Meridian Clinic</span>
        </div>

        {auth && (
          <div className="topbar-right">
            {auth.role !== "admin" && (
              calendarConnected ? (
                <span style={{ fontSize: "0.82rem", color: "var(--teal)", fontWeight: 500 }}>
                  📅 Calendar connected
                </span>
              ) : (
                <button className="btn btn-ghost" style={{ padding: "7px 14px", fontSize: "0.83rem" }} onClick={connectCalendar}>
                  Connect Calendar
                </button>
              )
            )}
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>{auth.fullName}</span>
            <span className="tag tag-status" style={{ fontSize: "0.72rem", padding: "3px 10px" }}>{auth.role}</span>
            <button className="btn btn-ghost" style={{ padding: "7px 14px" }} onClick={() => { logout(); navigate("/login"); }}>
              Sign out
            </button>
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

export function PulseDivider() {
  return (
    <svg className="pulse-divider" viewBox="0 0 400 24" preserveAspectRatio="none">
      <path
        d="M0 12 H140 L155 2 L170 22 L185 6 L195 12 H400"
        fill="none" stroke="#0E5C53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
