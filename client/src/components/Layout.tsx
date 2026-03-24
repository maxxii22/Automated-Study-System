import type { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";

import { StudySphereLogo } from "./StudySphereLogo";

export function Layout({ children }: PropsWithChildren) {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className={isHome ? "shell landing-shell" : "shell"}>
      <header className={isHome ? "topbar landing-topbar" : "topbar"}>
        <Link className="brand" to="/">
          <StudySphereLogo compact />
          <span className="brand-label">Study Sphere</span>
        </Link>
        <nav className="nav">
          <Link className={location.pathname === "/" ? "nav-link active" : "nav-link"} to="/">
            Home
          </Link>
          <Link className={location.pathname === "/saved" ? "nav-link active" : "nav-link"} to="/saved">
            Saved
          </Link>
          <Link className={location.pathname === "/create" ? "nav-link active" : "nav-link"} to="/create">
            Create
          </Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
