import type { ReactNode } from "react";
import { Component } from "react";
import { Link } from "react-router-dom";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error) {
    console.error("UI render error", error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <section className="panel error-panel">
          <p className="eyebrow">Something Broke</p>
          <h1>We hit a rendering error.</h1>
          <p className="muted">Refresh the page or head back home to keep working.</p>
          <Link className="primary-button" to="/">
            Back Home
          </Link>
        </section>
      );
    }

    return this.props.children;
  }
}
