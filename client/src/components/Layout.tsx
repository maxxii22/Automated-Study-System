import { useEffect, useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "./AuthProvider";
import { StudySphereLogo } from "./StudySphereLogo";

function UserIcon() {
  return (
    <svg aria-hidden="true" className="nav-icon-svg" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="7.5" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.75 20.25c.55-4 3.45-6.25 7.25-6.25s6.7 2.25 7.25 6.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function Layout({ children }: PropsWithChildren) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const { user, signOut } = useAuth();
  const routeKey = `${location.pathname}${location.search}`;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsSignOutConfirmOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isSignOutConfirmOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSignOutConfirmOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSignOutConfirmOpen]);

  async function handleConfirmedSignOut() {
    setIsSigningOut(true);

    try {
      await signOut();
      setIsSignOutConfirmOpen(false);
      setIsMobileMenuOpen(false);
    } finally {
      setIsSigningOut(false);
    }
  }

  const navItems = (
    <>
      <Link className={location.pathname === "/" ? "nav-link active" : "nav-link"} to="/">
        <span className="nav-link-label">Home</span>
        <span className="nav-link-meta">Overview</span>
      </Link>
      <Link className={location.pathname === "/saved" ? "nav-link active" : "nav-link"} to="/saved">
        <span className="nav-link-label">Saved</span>
        <span className="nav-link-meta">Library</span>
      </Link>
      <Link className={location.pathname === "/create" ? "nav-link active" : "nav-link"} to="/create">
        <span className="nav-link-label">Create</span>
        <span className="nav-link-meta">New pack</span>
      </Link>
      {user ? (
        <button
          className="nav-link nav-button auth-nav-link"
          onClick={() => {
            setIsMobileMenuOpen(false);
            setIsSignOutConfirmOpen(true);
          }}
          type="button"
        >
          <span className="nav-link-label">Sign Out</span>
          <span className="nav-link-meta">Leave session</span>
        </button>
      ) : (
        <Link
          className={location.pathname === "/auth" ? "nav-link auth-nav-link active" : "nav-link auth-nav-link"}
          to="/auth"
        >
          <span className="nav-link-label">Sign In</span>
          <span className="nav-link-meta">Continue</span>
        </Link>
      )}
    </>
  );

  return (
    <div className={isHome ? "shell landing-shell" : "shell"}>
      <header className={isHome ? "topbar landing-topbar" : "topbar"}>
        <Link className="brand" to="/">
          <StudySphereLogo compact />
          <span className="brand-copy">
            <span className="brand-label">Study Sphere</span>
            <span className="brand-subtitle">Study smarter with guided packs</span>
          </span>
        </Link>
        <div className="topbar-actions">
          {!user ? (
            <Link aria-label="Sign in" className="nav-icon-button account-icon-button" to="/auth">
              <UserIcon />
            </Link>
          ) : null}

          <button
            aria-controls="primary-nav"
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            className={isMobileMenuOpen ? "nav-icon-button menu-toggle is-open" : "nav-icon-button menu-toggle"}
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            type="button"
          >
            <span className="menu-toggle-line" />
            <span className="menu-toggle-line" />
            <span className="menu-toggle-line" />
          </button>
        </div>
        <nav aria-label="Primary" className="nav desktop-nav" id="primary-nav">
          <div className="nav-surface">{navItems}</div>
        </nav>
      </header>
      {isMobileMenuOpen ? (
        <div
          aria-hidden="true"
          className="mobile-nav-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <nav
            aria-label="Primary"
            className="nav mobile-nav is-mobile-open"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="nav-surface">{navItems}</div>
          </nav>
        </div>
      ) : null}
      {user && isSignOutConfirmOpen ? (
        <div
          aria-hidden="true"
          className="signout-overlay"
          onClick={() => setIsSignOutConfirmOpen(false)}
        >
          <div
            aria-label="Sign out confirmation"
            aria-modal="true"
            className="signout-popover"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <p className="signout-popover-title">Sign out?</p>
            <p className="signout-popover-copy">You’ll need to sign in again to continue your study session.</p>
            <div className="signout-popover-actions">
              <button
                className="secondary-button compact-button"
                onClick={() => setIsSignOutConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button compact-button"
                disabled={isSigningOut}
                onClick={() => void handleConfirmedSignOut()}
                type="button"
              >
                {isSigningOut ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <main className="route-shell">
        <div className="route-stage" key={routeKey}>
          {children}
        </div>
      </main>
    </div>
  );
}
