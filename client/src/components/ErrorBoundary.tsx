import type { ReactNode } from "react";
import { Component } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
        <section className="flex min-h-screen items-center justify-center px-4 py-12">
          <Card className="w-full max-w-2xl rounded-[2rem] border border-white/12 bg-black/35 shadow-[0_30px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            <CardContent className="space-y-6 p-8 sm:p-10">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-amber-200/82">Something Broke</p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white sm:text-5xl">
                We hit a rendering error.
              </h1>
              <p className="max-w-xl text-base leading-7 text-zinc-300">
                Refresh the page or head back home to keep working.
              </p>
              <Button
                asChild
                className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08863_38%,#d86aff_100%)] px-6 text-sm font-semibold text-slate-950 shadow-[0_18px_42px_rgba(240,136,99,0.25)] hover:opacity-95"
              >
                <Link to="/">Back Home</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      );
    }

    return this.props.children;
  }
}
