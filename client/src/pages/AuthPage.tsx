import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { CheckCircle2, LockKeyhole, Orbit, Sparkles, Stars } from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useAuth } from "../components/AuthProvider";
import { getSupabaseClient } from "../lib/supabase";

type AuthMode = "signin" | "signup";

const AUTH_EXPERIENCE_SIGNALS = [
  "Saved study packs stay attached to you",
  "Return to active jobs without losing context",
  "Keep oral exam history and rescue progress in one place"
] as const;

const AUTH_BENEFITS = [
  {
    icon: Orbit,
    title: "Saved Study History",
    copy: "Study sets, jobs, and oral exam sessions stay with your account across devices."
  },
  {
    icon: LockKeyhole,
    title: "Private by Default",
    copy: "Uploads, queue progress, and generated results remain scoped to your session."
  },
  {
    icon: Stars,
    title: "Return Anytime",
    copy: "Leave a long-running PDF job and come back later without losing your place."
  }
] as const;

const AUTH_MOBILE_HIGHLIGHTS = [
  "Saved packs and exam progress stay attached to your account.",
  "Return to active jobs without losing your place."
] as const;

function buildEmailRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return new URL("/auth?mode=signin", window.location.origin).toString();
}

function toAuthFeedbackError(message: string | null | undefined) {
  if (!message) {
    return "We couldn't complete that auth step. Please try again.";
  }

  const normalized = message.trim();

  if (/expired|invalid|otp_expired|token/i.test(normalized)) {
    return "This verification link is no longer valid. Request a new sign-up email and try again.";
  }

  if (/failed to fetch|network/i.test(normalized)) {
    return "We couldn't finish verification right now. Check your connection and try the link again.";
  }

  return normalized.length > 140 ? "We couldn't complete email verification. Please try signing in again." : normalized;
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const handledCodeRef = useRef<string | null>(null);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHandlingEmailLink, setIsHandlingEmailLink] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authFeedbackId = "auth-feedback";
  const authErrorId = "auth-error";

  const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/saved";

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
    const modeParam = searchParams.get("mode");
    const code = searchParams.get("code");
    const queryError = searchParams.get("error_description") ?? searchParams.get("error");
    const hashError = hashParams.get("error_description") ?? hashParams.get("error");

    if (modeParam === "signin" || modeParam === "signup") {
      setMode(modeParam);
    }

    if (searchParams.get("verified") === "1") {
      setMode("signin");
      setError(null);
      setMessage("Your email has been verified. Sign in now.");
    }

    if (!code && (queryError || hashError)) {
      setMode("signin");
      setMessage(null);
      setError(toAuthFeedbackError(queryError ?? hashError));
    }
  }, [location.hash, location.search]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const code = searchParams.get("code");

    if (!code || handledCodeRef.current === code) {
      return;
    }

    handledCodeRef.current = code;

    let ignore = false;

    const confirmEmail = async () => {
      try {
        setIsHandlingEmailLink(true);
        setError(null);
        setMessage(null);
        const supabase = await getSupabaseClient();

        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          throw exchangeError;
        }

        const confirmedEmail = data.session?.user.email;

        if (confirmedEmail && !ignore) {
          setEmail(confirmedEmail);
        }

        await supabase.auth.signOut();

        if (!ignore) {
          navigate("/auth?mode=signin&verified=1", { replace: true, state: location.state });
        }
      } catch (confirmationError) {
        if (!ignore) {
          navigate("/auth?mode=signin", { replace: true, state: location.state });
          setError(toAuthFeedbackError(confirmationError instanceof Error ? confirmationError.message : null));
        }
      } finally {
        if (!ignore) {
          setIsHandlingEmailLink(false);
        }
      }
    };

    void confirmEmail();

    return () => {
      ignore = true;
    };
  }, [location.search, location.state, navigate]);

  if (!isLoading && user) {
    return <Navigate replace to={destination} />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: buildEmailRedirectUrl()
          }
        });

        if (signUpError) {
          throw signUpError;
        }

        if (data.session) {
          navigate(destination, { replace: true });
          return;
        }

        setMessage("Check your email to verify your account. We’ll bring you back here to sign in.");
        setMode("signin");
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
    <section className="relative px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.84fr)]">
        <Reveal className="order-2 space-y-6 sm:space-y-8 lg:order-1">
          <div className="sm:hidden">
            <Card className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,181,111,0.06))] shadow-[0_22px_70px_rgba(0,0,0,0.2)]">
              <CardContent className="space-y-4 p-5">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100" variant="outline">
                  Account access
                </Badge>
                <div className="space-y-3">
                  <h1 className="max-w-[12ch] text-balance font-[family-name:var(--font-display)] text-[2.35rem] leading-[0.94] text-white">
                    {mode === "signin" ? "Your study history stays with you." : "Start saving your study history."}
                  </h1>
                  <p className="text-sm leading-7 text-zinc-300">
                    {mode === "signin"
                      ? "Sign in to reopen saved packs and resume your work quickly."
                      : "Create an account so your study packs, jobs, and exam progress stay attached to you."}
                  </p>
                </div>
                <div className="space-y-2.5">
                  {AUTH_MOBILE_HIGHLIGHTS.map((highlight) => (
                    <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm leading-6 text-zinc-300" key={highlight}>
                      {highlight}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="hidden space-y-4 sm:block sm:space-y-5">
            <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-100" variant="outline">
              Account access
            </Badge>
            <h1 className="max-w-[12ch] text-balance font-[family-name:var(--font-display)] text-[clamp(2.95rem,12vw,4.35rem)] leading-[0.92] text-white sm:max-w-3xl sm:text-5xl sm:leading-[0.95] lg:text-6xl">
              {mode === "signin" ? "Pick up your study momentum exactly where you left it." : "Give your study system memory."}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
              {mode === "signin"
                ? "Sign in to reopen saved study packs, resume active jobs, and keep exam practice tied to your account."
                : "Create an account so every guide, flashcard set, and oral exam session stays attached to you."}
            </p>
          </div>

          <div className="hidden flex-wrap gap-2.5 sm:flex sm:gap-3">
            {AUTH_EXPERIENCE_SIGNALS.map((signal) => (
              <Badge
                className="max-w-full rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.68rem] font-medium tracking-[0.14em] text-zinc-300 sm:px-4 sm:text-[0.72rem] sm:tracking-[0.16em]"
                key={signal}
                variant="outline"
              >
                {signal}
              </Badge>
            ))}
          </div>

          <Card className="hidden overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,181,111,0.06))] shadow-[0_28px_90px_rgba(0,0,0,0.24)] sm:block">
            <CardContent className="grid gap-4 p-6 sm:grid-cols-3 sm:p-7">
              {AUTH_BENEFITS.map((item) => {
                const Icon = item.icon;

                return (
                  <article className="space-y-3 rounded-[1.4rem] border border-white/8 bg-black/20 p-4" key={item.title}>
                    <span className="inline-flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-amber-200">
                      <Icon className="size-5" />
                    </span>
                    <div className="space-y-2">
                      <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                      <p className="text-sm leading-7 text-zinc-400">{item.copy}</p>
                    </div>
                  </article>
                );
              })}
            </CardContent>
          </Card>
        </Reveal>

        <Reveal className="order-1 lg:order-2 lg:pt-8" delay={0.08}>
          <Card className="rounded-[2rem] border border-white/10 bg-black/34 shadow-[0_30px_90px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <CardContent className="space-y-7 p-6 sm:p-8">
              <div className="space-y-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                  {mode === "signin" ? "Welcome back" : "New here"}
                </p>
                <h2 className="max-w-[12ch] text-balance font-[family-name:var(--font-display)] text-[clamp(2.35rem,10vw,3.25rem)] leading-[0.96] text-white sm:max-w-none sm:text-4xl sm:leading-tight">
                  {mode === "signin" ? "Sign in to Study Sphere" : "Create your Study Sphere account"}
                </h2>
                <p className="text-sm leading-7 text-zinc-400">
                  {mode === "signin"
                    ? "Use the email and password connected to your study history."
                    : "We only need a few basics to secure your saved work and let you keep building on it."}
                </p>
              </div>

              {isHandlingEmailLink ? (
                <div
                  aria-live="polite"
                  className="rounded-[1.4rem] border border-white/10 bg-white/[0.05] px-4 py-4 text-sm leading-7 text-zinc-300"
                  id={authFeedbackId}
                  role="status"
                >
                  <p className="font-semibold text-white">Verifying your email</p>
                  <p>We’re confirming your email link and getting sign-in ready.</p>
                </div>
              ) : null}

              {message ? (
                <div
                  aria-live="polite"
                  className="flex gap-3 rounded-[1.4rem] border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm leading-7 text-emerald-100"
                  id={authFeedbackId}
                  role="status"
                >
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                  <p>{message}</p>
                </div>
              ) : null}

              {error ? (
                <div
                  className="rounded-[1.4rem] border border-rose-300/20 bg-rose-300/10 px-4 py-4 text-sm leading-7 text-rose-100"
                  id={authErrorId}
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <form
                aria-busy={isSubmitting || isHandlingEmailLink}
                aria-describedby={error ? authErrorId : message || isHandlingEmailLink ? authFeedbackId : undefined}
                className="space-y-5"
                onSubmit={handleSubmit}
              >
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-zinc-200" htmlFor="auth-email">
                    Email
                  </Label>
                  <Input
                    autoComplete="email"
                    className="h-12 rounded-2xl border-white/10 bg-white/[0.04] px-4 text-base text-white placeholder:text-zinc-500 focus-visible:border-amber-200/50 focus-visible:ring-amber-200/20"
                    id="auth-email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    type="email"
                    value={email}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-zinc-200" htmlFor="auth-password">
                    Password
                  </Label>
                  <Input
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="h-12 rounded-2xl border-white/10 bg-white/[0.04] px-4 text-base text-white placeholder:text-zinc-500 focus-visible:border-amber-200/50 focus-visible:ring-amber-200/20"
                    id="auth-password"
                    minLength={6}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 6 characters"
                    type="password"
                    value={password}
                  />
                </div>

                <Button
                  className="h-12 w-full rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_36%,#bc7cff_100%)] text-sm font-semibold text-slate-950 shadow-[0_20px_48px_rgba(240,141,99,0.24)] hover:opacity-95"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
                </Button>
              </form>

              <div className="flex flex-col items-start gap-3 rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-zinc-400">
                  {mode === "signin" ? "Need a new account?" : "Already have an account?"}
                </span>
                <Button
                  className="h-10 rounded-full border border-white/10 bg-white/[0.05] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                  onClick={() => {
                    setMode((current) => (current === "signin" ? "signup" : "signin"));
                    setError(null);
                    setMessage(null);
                  }}
                  type="button"
                  variant="ghost"
                >
                  {mode === "signin" ? "Create one" : "Sign in instead"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
