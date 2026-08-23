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
        <h1>Create your account</h1>
        <p className="sub">Book appointments and track your care in one place.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" required value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone (optional)</label>
            <input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={8} value={form.password} onChange={(e) => update("password", e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <div className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
