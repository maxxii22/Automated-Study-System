import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatePanelProps = {
  eyebrow: string;
  title: string;
  copy: string;
  tone?: "default" | "error";
  actions?: ReactNode;
};

export function StatePanel({ eyebrow, title, copy, tone = "default", actions }: StatePanelProps) {
  const titleId = `${eyebrow.toLowerCase().replace(/[^\w]+/g, "-") || "state"}-title`;
  const copyId = `${eyebrow.toLowerCase().replace(/[^\w]+/g, "-") || "state"}-copy`;

  return (
    <section
      aria-describedby={copyId}
      aria-labelledby={titleId}
      className="flex min-h-[60vh] items-center justify-center px-4 py-10 sm:px-6"
      role={tone === "error" ? "alert" : "status"}
    >
      <Card
        className={cn(
          "w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/12 bg-black/35 shadow-[0_28px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl",
          tone === "error" && "border-rose-400/30"
        )}
      >
        <CardContent className="space-y-6 p-8 sm:p-10">
          <Badge
            className={cn(
              "rounded-full border px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.26em]",
              tone === "error"
                ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                : "border-white/12 bg-white/8 text-zinc-100"
            )}
            variant="outline"
          >
            {eyebrow}
          </Badge>
          <div className="space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-white sm:text-4xl" id={titleId}>
              {title}
            </h2>
            <p className="max-w-2xl text-base leading-7 text-zinc-300" id={copyId}>
              {copy}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </CardContent>
      </Card>
    </section>
  );
}
