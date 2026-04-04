import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthProvider";
import { RouteLoadingState } from "./RouteLoadingState";

export function RequireAuth() {
  const location = useLocation();
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <RouteLoadingState
        copy="We’re reconnecting your saved study sets, recent jobs, and exam history."
        eyebrow="Checking Session"
        title="Restoring your study space..."
      />
    );
  }

  if (!user) {
    return <Navigate replace state={{ from: location }} to="/auth" />;
  }

  return <Outlet />;
}
