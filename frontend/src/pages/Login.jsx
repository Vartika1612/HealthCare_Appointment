import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("patient");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(email, password);
      routeByRole(data.role, navigate);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't sign in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {/* Brand mark */}
        <div className="auth-logo">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M2 12h5l2-7 4 14 2-7h7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="brand-name">Meridian Clinic</span>
        </div>

        {/* Role selector */}
        <div className="segmented-control">
          <button
            type="button"
            className={`segmented-tab ${activeTab === "patient" ? "active" : ""}`}
            onClick={() => setActiveTab("patient")}
          >
            Patient
          </button>
          <button
            type="button"
            className={`segmented-tab ${activeTab === "staff" ? "active" : ""}`}
            onClick={() => setActiveTab("staff")}
          >
            Doctor / Admin
          </button>
        </div>

        <h1>Welcome back</h1>
        <p className="sub">Sign in to manage your appointments.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 4 }} disabled={loading}>
            {loading ? <><span className="spinner" /> Signing in…</> : "Sign in"}
          </button>
        </form>

        <div className="auth-switch">
          {activeTab === "patient" ? (
            <>New patient? <Link to="/register">Create an account</Link></>
          ) : (
            <span style={{ fontSize: "0.85rem", lineHeight: 1.55 }}>
              Doctor and admin accounts are created by your clinic administrator — use the credentials they provided.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function routeByRole(role, navigate) {
  if (role === "admin") navigate("/admin");
  else if (role === "doctor") navigate("/doctor");
  else navigate("/patient");
}
