import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type RouteLoadingStateProps = {
  eyebrow?: string;
  title?: string;
  copy?: string;
};

export function RouteLoadingState({
  eyebrow = "Preparing Workspace",
  title = "Loading the next study surface...",
  copy = "We’re reconnecting your study memory, active routes, and the cinematic UI around them."
}: RouteLoadingStateProps) {
  const titleId = "route-loading-title";
  const copyId = "route-loading-copy";

  return (
    <section
      aria-busy="true"
      aria-describedby={copyId}
      aria-labelledby={titleId}
      aria-live="polite"
      className="flex min-h-[60vh] items-center justify-center px-4 py-10 sm:px-6"
      role="status"
    >
      <Card className="w-full max-w-3xl overflow-hidden rounded-[2rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,17,27,0.96),rgba(9,11,18,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
        <CardContent className="space-y-7 p-8 sm:p-10">
          <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
            {eyebrow}
          </Badge>

          <div className="space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white sm:text-5xl" id={titleId}>
              {title}
            </h2>
            <p className="max-w-2xl text-base leading-8 text-zinc-300" id={copyId}>
              {copy}
            </p>
          </div>

          <div aria-hidden="true" className="space-y-4">
            <Skeleton className="h-3 w-full rounded-full bg-white/8" />
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-40 rounded-[1.5rem] bg-white/8" />
              <Skeleton className="h-40 rounded-[1.5rem] bg-white/8" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-11 w-36 rounded-full bg-white/8" />
              <Skeleton className="h-11 w-28 rounded-full bg-white/8" />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
