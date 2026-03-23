import type { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";

export function Layout({ children }: PropsWithChildren) {
  const location = useLocation();

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/">
          Automated Study Systems
        </Link>
        <nav className="nav">
          <Link className={location.pathname === "/" ? "nav-link active" : "nav-link"} to="/">
            Home
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
