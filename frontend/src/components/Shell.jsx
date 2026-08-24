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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v16m-8-8h16" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="brand-name">Meridian Clinic</span>
        </div>

        {auth && (
          <div className="topbar-right">
            {auth.role !== "admin" && (
              calendarConnected ? (
                <span style={{ fontSize: "0.83rem", color: "#166534", fontWeight: 600, background: "#DCFCE7", padding: "4px 12px", borderRadius: 999 }}>
                  ✓ Calendar Connected
                </span>
              ) : (
                <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: "0.83rem" }} onClick={connectCalendar}>
                  Connect Calendar
                </button>
              )
            )}
            
            <div className="user-profile-badge">
              <div className="avatar-circle">
                {auth.fullName ? auth.fullName.charAt(0).toUpperCase() : "U"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", paddingRight: 4 }}>
                <span style={{ color: "var(--ink-heading)", fontWeight: 700, fontSize: "0.88rem", lineHeight: 1.2 }}>
                  {auth.fullName}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "capitalize" }}>
                  {auth.role}
                </span>
              </div>
            </div>

            <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: "0.85rem" }} onClick={() => { logout(); navigate("/login"); }}>
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
