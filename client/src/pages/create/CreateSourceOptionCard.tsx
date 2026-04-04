import type { LucideIcon } from "lucide-react";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type CreateSourceOptionCardProps = {
  active: boolean;
  description: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  title: string;
};

export function CreateSourceOptionCard({
  active,
  description,
  icon: Icon,
  label,
  onClick,
  title
}: CreateSourceOptionCardProps) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "group relative overflow-hidden rounded-[1.7rem] border p-5 text-left transition duration-200",
        active
          ? "border-amber-200/30 bg-[linear-gradient(145deg,rgba(255,181,111,0.14),rgba(255,255,255,0.05))] shadow-[0_20px_50px_rgba(240,141,99,0.12)]"
          : "border-white/10 bg-white/[0.04] hover:border-white/16 hover:bg-white/[0.06]"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-amber-200">
          <Icon className="size-5" />
        </span>
        {active ? (
          <span className="inline-flex size-8 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
            <Check className="size-4" />
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-zinc-500">{label}</p>
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="text-sm leading-7 text-zinc-400">{description}</p>
      </div>
    </button>
  );
}
