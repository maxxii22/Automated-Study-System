import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthProvider";

export function RequireAuth() {
  const location = useLocation();
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <section className="panel auth-loading-panel">
        <p className="eyebrow">Checking Session</p>
        <h2>Restoring your study space...</h2>
        <p className="muted">We&apos;re reconnecting your saved study sets, recent jobs, and exam history.</p>
        <div className="loading-stack auth-loading-stack" aria-hidden="true">
          <div className="skeleton-line loading-heading-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line loading-subtle-line" />
          <div className="loading-chip-row">
            <div className="skeleton-line loading-chip-line" />
            <div className="skeleton-line loading-chip-line" />
          </div>
        </div>
      </section>
    );
  }

  if (!user) {
    return <Navigate replace state={{ from: location }} to="/auth" />;
  }

  return <Outlet />;
}
