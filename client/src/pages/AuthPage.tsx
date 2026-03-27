import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../components/AuthProvider";
import { supabase } from "../lib/supabase";

type AuthMode = "signin" | "signup";

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/saved";

  if (!isLoading && user) {
    return <Navigate replace to={destination} />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password
        });

        if (signUpError) {
          throw signUpError;
        }

        setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          throw signInError;
        }

        navigate(destination, { replace: true });
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page-grid auth-page">
      <article className="panel auth-intro-panel">
        <p className="eyebrow">Account Access</p>
        <h1>{mode === "signin" ? "Pick up where you left off." : "Make your study space personal."}</h1>
        <p className="muted auth-lead">
          {mode === "signin"
            ? "Sign in to reopen your saved study sets, resume PDF jobs, and keep oral exam practice tied to your account."
            : "Create an account so every generated guide, flashcard set, and exam session stays attached to you."}
        </p>

        <div className="auth-feature-list">
          <div className="auth-feature-card">
            <strong>Saved Study History</strong>
            <span>Study sets and oral exam sessions stay with your account across devices.</span>
          </div>
          <div className="auth-feature-card">
            <strong>Private Job Tracking</strong>
            <span>Your uploads, queue progress, and generated results are scoped to you.</span>
          </div>
          <div className="auth-feature-card">
            <strong>Return Anytime</strong>
            <span>Leave a long-running PDF job and come back later without losing your place.</span>
          </div>
        </div>
      </article>

      <article className="panel auth-form-panel">
        <div className="auth-form-header">
          <p className="eyebrow">{mode === "signin" ? "Welcome Back" : "New Here"}</p>
          <h2>{mode === "signin" ? "Sign in to Study Sphere" : "Create your Study Sphere account"}</h2>
          <p className="muted">
            {mode === "signin"
              ? "Use the email and password connected to your study history."
              : "We only need a few basics to create your account and secure your saved work."}
          </p>
        </div>

        <form className="field auth-form" onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Email</label>
          <input
            autoComplete="email"
            id="auth-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
            value={email}
          />

          <label htmlFor="auth-password">Password</label>
          <input
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            id="auth-password"
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            type="password"
            value={password}
          />

          <button className="primary-button auth-submit-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {message ? <p className="success-text auth-feedback">{message}</p> : null}
        {error ? <p className="error-text auth-feedback">{error}</p> : null}

        <div className="auth-footer">
          <span className="muted">{mode === "signin" ? "Need a new account?" : "Already have an account?"}</span>
          <button
            className="secondary-button compact-button"
            onClick={() => {
              setMode((current) => (current === "signin" ? "signup" : "signin"));
              setError(null);
              setMessage(null);
            }}
            type="button"
          >
            {mode === "signin" ? "Create one" : "Sign in instead"}
          </button>
        </div>
      </article>
    </section>
  );
}
