import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { BellIcon } from "../components/icons";

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
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark brand-mark-lg">
            <BellIcon width={22} height={22} />
          </span>
          <h1>SignalBox</h1>
        </div>
        <p className="auth-subtitle">{isRegister ? "Create an account to start sending and receiving notifications." : "Sign in to your notification center."}</p>

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
        <a className="text-link full-width" href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Already have an account? Sign in" : "Need an account? Register"}
        </a>
      </div>
    </div>
  );
}
