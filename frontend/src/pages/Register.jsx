import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      navigate("/patient");
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't create your account. Please try again.");
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

        <h1>Create your account</h1>
        <p className="sub">Book appointments and track your care in one place.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" required autoComplete="name"
              value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" required autoComplete="email"
              value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></label>
            <input id="phone" type="tel" autoComplete="tel"
              value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={8} autoComplete="new-password"
              value={form.password} onChange={(e) => update("password", e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 4 }} disabled={loading}>
            {loading ? <><span className="spinner" /> Creating account…</> : "Create account"}
          </button>
        </form>

        <div className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
