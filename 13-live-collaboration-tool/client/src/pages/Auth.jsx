import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function Auth({ mode }) {
  const isRegister = mode === "register";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isRegister) await register(username, email, password);
      else await login(email, password);
      navigate("/");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand brand-center">
          <span className="brand-mark">S</span>
          SyncBoard
        </div>
        <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="subtitle">{isRegister ? "Takes less than a minute." : "Sign in to continue."}</p>

        <form className="stacked-form" onSubmit={submit}>
          {isRegister && (
            <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
          )}
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>
        <a className="ghost-link-btn full-width" href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Already have an account? Sign in" : "Need an account? Register"}
        </a>
      </div>
    </div>
  );
}
