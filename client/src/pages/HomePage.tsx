import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Compass, LibraryBig, Rocket, Sparkles, Stars, WandSparkles } from "lucide-react";

import { PrefetchLink } from "@/components/PrefetchLink";
import { Reveal } from "@/components/Reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PRIMARY_SIGNALS = [
  {
    icon: Sparkles,
    label: "Creation",
    headline: "Turn raw material into a study surface with shape, rhythm, and confidence."
  },
  {
    icon: LibraryBig,
    label: "Return Visits",
    headline: "Saved packs feel like assets worth reopening, not disposable generations."
  },
  {
    icon: Compass,
    label: "Recovery",
    headline: "Weak moments turn into guided correction instead of stalled momentum."
  }
] as const;

const PILLARS = [
  {
    eyebrow: "Clarity first",
    title: "Dense notes become a readable starting point.",
    copy: "Users should feel relief immediately. The interface needs to transform overwhelm into a clean next step."
  },
  {
    eyebrow: "Built for recall",
    title: "Reading turns into action without friction.",
    copy: "Study packs should lead naturally into flashcards, oral exam pressure, and visible progress."
  },
  {
    eyebrow: "Designed to reopen",
    title: "The library should feel like memory, not storage.",
    copy: "Everything about the product should reinforce return behavior and make saved work feel alive."
  }
] as const;

const PRODUCT_LOOP = [
  {
    step: "01",
    title: "Bring the source",
    copy: "Paste notes, transcripts, or a PDF and let the system take over the heavy lifting."
  },
  {
    step: "02",
    title: "Shape the pack",
    copy: "Build a cleaner study experience with summaries, concepts, recall cards, and guided practice."
  },
  {
    step: "03",
    title: "Keep the loop alive",
    copy: "Return, rehearse, recover weak spots, and carry your progress forward."
  }
] as const;

const EXPERIENCE_BADGES = ["Guides", "Flashcards", "Oral exams", "Rescue loops"] as const;

export function HomePage() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative overflow-hidden">
      <section className="relative min-h-[calc(100vh-8rem)] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div aria-hidden="true" className="landing-comets">
          <span className="landing-comet landing-comet-a" />
          <span className="landing-comet landing-comet-b" />
          <span className="landing-comet landing-comet-c" />
          <span className="landing-stars" />
        </div>

        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)] lg:items-center">
          <Reveal className="relative z-10 space-y-8 pt-8 sm:pt-14" delay={0.02}>
            <Badge
              className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-zinc-100"
              variant="outline"
            >
              Cinematic Study Operating System
            </Badge>

            <div className="space-y-6">
              <h1 className="max-w-5xl font-[family-name:var(--font-display)] text-5xl leading-[0.92] tracking-tight text-white sm:text-6xl lg:text-7xl">
                The study app should feel like a place people want to come back to.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
                Study Sphere turns notes, transcripts, and PDFs into a warmer, sharper revision experience built for
                recall, recovery, and return visits.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_36%,#bc7cff_100%)] px-6 text-sm font-semibold text-slate-950 shadow-[0_22px_48px_rgba(240,141,99,0.28)] hover:opacity-95"
              >
                <PrefetchLink to="/create">
                  Build a Study Pack
                  <ArrowRight className="size-4" />
                </PrefetchLink>
              </Button>
              <Button
                asChild
                className="h-12 rounded-full border border-white/12 bg-white/[0.05] px-6 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                variant="ghost"
              >
                <PrefetchLink to="/saved">Explore the Library</PrefetchLink>
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              {EXPERIENCE_BADGES.map((badge) => (
                <Badge
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[0.72rem] font-medium tracking-[0.16em] text-zinc-300"
                  key={badge}
                  variant="outline"
                >
                  {badge}
                </Badge>
              ))}
            </div>
          </Reveal>

          <motion.div
            animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
            className="relative z-10"
            transition={reduceMotion ? undefined : { duration: 10, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
          >
            <Card className="overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(15,20,32,0.84),rgba(8,11,18,0.9))] shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <CardContent className="space-y-8 p-6 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                      Product narrative
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-tight text-white">
                      A premium study loop, not a one-off generator.
                    </h2>
                  </div>
                  <Badge className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-1.5 text-[0.68rem] uppercase tracking-[0.24em] text-emerald-100" variant="outline">
                    Designed for return visits
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {PRIMARY_SIGNALS.map((signal, index) => {
                    const Icon = signal.icon;

                    return (
                      <Reveal className={index === 0 ? "sm:col-span-2" : ""} delay={0.1 + index * 0.07} key={signal.label}>
                        <article className="h-full rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
                          <div className="mb-5 flex items-center gap-3">
                            <span className="inline-flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-amber-200">
                              <Icon className="size-5" />
                            </span>
                            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-zinc-500">
                              {signal.label}
                            </span>
                          </div>
                          <p className="font-[family-name:var(--font-display)] text-2xl leading-tight text-white">
                            {signal.headline}
                          </p>
                        </article>
                      </Reveal>
                    );
                  })}
                </div>

                <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,181,111,0.08),rgba(255,255,255,0.02))] p-5">
                  <div className="flex items-start gap-4">
                    <span className="inline-flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-amber-200">
                      <Stars className="size-5" />
                    </span>
                    <div className="space-y-2">
                      <p className="text-sm leading-7 text-zinc-300">
                        Every mode reinforces the next one, so the experience reads like a system with momentum instead of a pile
                        of disconnected features.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      <section className="px-4 py-18 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-10">
          <Reveal className="space-y-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Why it feels different</p>
            <h2 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight text-white sm:text-5xl">
              Simpler surfaces, stronger emotion, clearer purpose.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-zinc-400">
              The redesign direction is about cutting chunkiness, removing clutter, and making the product feel deliberate
              from the first second.
            </p>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-3">
            {PILLARS.map((pillar, index) => (
              <Reveal delay={0.08 + index * 0.07} key={pillar.title}>
                <Card className="h-full rounded-[1.75rem] border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
                  <CardContent className="space-y-4 p-6">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">{pillar.eyebrow}</p>
                    <h3 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-white">{pillar.title}</h3>
                    <p className="text-sm leading-7 text-zinc-400">{pillar.copy}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,181,111,0.06))] shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur-sm">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
            <div className="space-y-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Product loop</p>
              <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white">
                A study flow that compounds after generation.
              </h2>
              <p className="text-base leading-8 text-zinc-400">
                The strongest part of the product is not the first output. It’s the sequence that keeps giving users reasons to
                reopen, review, and recover.
              </p>
            </div>

            <div className="space-y-4">
              {PRODUCT_LOOP.map((item, index) => (
                <Reveal className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5" delay={0.08 + index * 0.08} key={item.step}>
                  <div className="flex gap-4">
                    <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-sm font-semibold text-white">
                      {item.step}
                    </span>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                      <p className="text-sm leading-7 text-zinc-400">{item.copy}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      <section className="px-4 py-18 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-7xl rounded-[2.1rem] border border-white/10 bg-[linear-gradient(140deg,rgba(12,16,26,0.92),rgba(13,18,31,0.86),rgba(255,181,111,0.08))] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">Launch the experience</p>
              <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white sm:text-5xl">
                Build the first impression around clarity, momentum, and warmth.
              </h2>
              <p className="text-base leading-8 text-zinc-400">
                Start with notes or a PDF, generate the study surface, and carry people into something that feels worth
                reopening.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_36%,#bc7cff_100%)] px-6 text-sm font-semibold text-slate-950 shadow-[0_22px_48px_rgba(240,141,99,0.28)] hover:opacity-95"
              >
                <PrefetchLink to="/create">
                  <Rocket className="size-4" />
                  Start Creating
                </PrefetchLink>
              </Button>
              <Button
                asChild
                className="h-12 rounded-full border border-white/12 bg-white/[0.05] px-6 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                variant="ghost"
              >
                <PrefetchLink to="/auth">
                  <WandSparkles className="size-4" />
                  Sign In
                </PrefetchLink>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
