import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookMarked, LogOut, Menu, Sparkles, UserRound } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { preloadRoute } from "@/lib/routePreload";
import { cn } from "@/lib/utils";

import { useAuth } from "./AuthProvider";
import { PrefetchLink } from "./PrefetchLink";
import { StudySphereLogo } from "./StudySphereLogo";

const NAV_ITEMS = [
  { to: "/", label: "Home", meta: "Overview" },
  { to: "/saved", label: "Saved", meta: "Library" },
  { to: "/create", label: "Create", meta: "New pack" }
] as const;

export function Layout({ children }: PropsWithChildren) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const reduceMotion = useReducedMotion();
  const isHome = location.pathname === "/";
  const routeKey = `${location.pathname}${location.search}`;
  const handleRouteIntent = (pathname: string) => {
    void preloadRoute(pathname);
  };

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";

    return () => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "";
    };
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsSignOutConfirmOpen(false);
  }, [location.pathname, location.search]);

  const brandSubtitle = useMemo(() => {
    if (location.pathname === "/") {
      return "Cinematic study operating system";
    }

    if (location.pathname === "/create") {
      return "Craft a premium study pack";
    }

    if (location.pathname === "/saved") {
      return "Persistent learning library";
    }

    if (location.pathname === "/auth") {
      return "Secure your study memory";
    }

    if (location.pathname.includes("/exam")) {
      return "Adaptive oral exam workspace";
    }

    return "Guided revision cockpit";
  }, [location.pathname]);

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

  const navLinks = (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          className={({ isActive }) =>
            cn(
              "group flex min-w-[108px] flex-col rounded-full border px-4 py-2.5 text-left transition duration-200",
              isActive
                ? "border-white/18 bg-white/14 text-white shadow-[0_14px_30px_rgba(0,0,0,0.22)]"
                : "border-white/8 bg-transparent text-zinc-300 hover:border-white/14 hover:bg-white/[0.05] hover:text-white"
            )
          }
          key={item.to}
          onFocus={() => handleRouteIntent(item.to)}
          onMouseEnter={() => handleRouteIntent(item.to)}
          to={item.to}
        >
          <span className="text-sm font-semibold">{item.label}</span>
          <span className="text-[0.63rem] font-medium uppercase tracking-[0.22em] text-zinc-500 group-hover:text-zinc-400">
            {item.meta}
          </span>
        </NavLink>
      ))}
    </>
  );

  return (
    <div className={cn("relative min-h-screen overflow-x-hidden", isHome && "bg-transparent")}>
      <a
        className="absolute left-4 top-4 z-50 -translate-y-20 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 opacity-0 shadow-[0_14px_30px_rgba(0,0,0,0.24)] transition focus:translate-y-0 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
        href="#main-content"
      >
        Skip to content
      </a>

      <div aria-hidden="true" className="global-ambient">
        <span className="global-ambient-orb global-ambient-orb-a" />
        <span className="global-ambient-orb global-ambient-orb-b" />
        <span className="global-ambient-orb global-ambient-orb-c" />
        <span className="global-grid" />
      </div>

      <header className="sticky top-0 z-40 px-3 pb-3 pt-3 sm:px-6 lg:px-8">
        <div
          className={cn(
            "mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-[1.9rem] border border-white/10 bg-black/28 px-3.5 py-2.5 shadow-[0_24px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:gap-4 sm:px-5 sm:py-3",
            isHome && "bg-black/24"
          )}
        >
          <PrefetchLink className="flex min-w-0 items-center gap-2.5 sm:gap-3" to="/">
            <StudySphereLogo compact />
            <span className="min-w-0">
              <span className="block truncate font-[family-name:var(--font-display)] text-[1.85rem] leading-none tracking-tight text-white sm:text-2xl">
                Study Sphere
              </span>
              <span className="mt-1 hidden truncate text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-zinc-500 sm:block">
                {brandSubtitle}
              </span>
            </span>
          </PrefetchLink>

          <nav aria-label="Primary" className="hidden items-center gap-2 xl:flex">
            {navLinks}
          </nav>

          <div className="hidden items-center gap-2 xl:flex">
            {user ? (
              <Button
                className="h-11 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                onClick={() => setIsSignOutConfirmOpen(true)}
                variant="ghost"
              >
                <LogOut className="size-4" />
                Sign Out
              </Button>
            ) : (
              <Button
                asChild
                className="h-11 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                variant="ghost"
              >
                <PrefetchLink to="/auth">
                  <UserRound className="size-4" />
                  Sign In
                </PrefetchLink>
              </Button>
            )}
            <Button
              asChild
              className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
            >
              <PrefetchLink to="/create">
                <Sparkles className="size-4" />
                Start Creating
              </PrefetchLink>
            </Button>
          </div>

          <Sheet onOpenChange={setIsMobileMenuOpen} open={isMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                className="size-11 rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08] xl:hidden"
                size="icon-lg"
                variant="ghost"
              >
                <Menu className="size-5" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              className="w-[86vw] max-w-sm border-white/10 bg-[#090d15]/96 p-0 text-white shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
              side="right"
            >
              <SheetHeader className="gap-4 border-b border-white/8 px-5 py-5">
                <div className="flex items-center gap-3">
                  <StudySphereLogo compact />
                  <div>
                    <SheetTitle className="font-[family-name:var(--font-display)] text-2xl text-white">Study Sphere</SheetTitle>
                    <SheetDescription className="text-zinc-400">The cinematic study system for return visits.</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex flex-col gap-3 px-5 py-5">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    className={({ isActive }) =>
                      cn(
                        "rounded-[1.4rem] border px-4 py-4 transition",
                        isActive
                          ? "border-white/14 bg-white/10 text-white"
                          : "border-white/8 bg-white/[0.03] text-zinc-300 hover:border-white/12 hover:bg-white/[0.06]"
                      )
                    }
                    key={item.to}
                    onFocus={() => handleRouteIntent(item.to)}
                    onMouseEnter={() => handleRouteIntent(item.to)}
                    to={item.to}
                  >
                    <span className="block text-base font-semibold">{item.label}</span>
                    <span className="mt-1 block text-[0.68rem] font-medium uppercase tracking-[0.24em] text-zinc-500">
                      {item.meta}
                    </span>
                  </NavLink>
                ))}
              </div>

              <div className="mt-auto border-t border-white/8 px-5 py-5">
                <div className="flex flex-col gap-3">
                  {user ? (
                    <Button
                      className="h-12 rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
                      onClick={() => setIsSignOutConfirmOpen(true)}
                      variant="ghost"
                    >
                      <LogOut className="size-4" />
                      Sign Out
                    </Button>
                  ) : (
                    <Button
                      asChild
                      className="h-12 rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
                      variant="ghost"
                    >
                      <PrefetchLink to="/auth">
                        <UserRound className="size-4" />
                        Sign In
                      </PrefetchLink>
                    </Button>
                  )}
                  <Button
                    asChild
                    className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                  >
                    <PrefetchLink to="/create">
                      <Sparkles className="size-4" />
                      Start Creating
                    </PrefetchLink>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="relative z-10" id="main-content" tabIndex={-1}>
        <div className={cn(isHome ? "w-full" : "mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8")}>
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
              key={routeKey}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <footer className="relative z-10 px-4 pb-8 pt-4 text-center sm:px-6 lg:px-8">
        <div className={cn("mx-auto max-w-7xl", isHome && "max-w-none")}>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">
            <BookMarked className="size-3.5" />
            Study Sphere by Maxxii Inc
          </p>
        </div>
      </footer>

      <AlertDialog onOpenChange={setIsSignOutConfirmOpen} open={user ? isSignOutConfirmOpen : false}>
        <AlertDialogContent className="rounded-[1.8rem] border-white/10 bg-[#0d111b]/96 text-white shadow-[0_30px_90px_rgba(0,0,0,0.52)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-[family-name:var(--font-display)] text-3xl text-white">
              Sign out?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-7 text-zinc-400">
              You’ll need to sign in again to resume your saved study sets, jobs, and revision history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:justify-start">
            <AlertDialogCancel className="h-11 rounded-full border-white/10 bg-white/[0.04] px-5 text-zinc-100 hover:bg-white/[0.08]">
              Stay Signed In
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmedSignOut();
              }}
            >
              {isSigningOut ? "Signing Out..." : "Sign Out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
