import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Shell({ children }) {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

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
            <span>{auth.fullName} · {auth.role}</span>
            <button className="btn btn-ghost" onClick={() => { logout(); navigate("/login"); }}>
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
