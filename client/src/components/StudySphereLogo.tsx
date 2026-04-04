import { cn } from "@/lib/utils";

import studySphereLogo from "../assets/logo/SS logo.png";

type StudySphereLogoProps = {
  compact?: boolean;
  className?: string;
};

export function StudySphereLogo({ compact = false, className }: StudySphereLogoProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative isolate flex items-center justify-center overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-sm",
        compact ? "size-[4.25rem] sm:size-[5rem]" : "size-[5.25rem] sm:size-[6rem]",
        className
      )}
    >
      <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_20%_20%,rgba(255,193,122,0.18),transparent_38%),radial-gradient(circle_at_80%_70%,rgba(91,152,255,0.12),transparent_42%)]" />
      <div className="absolute inset-[1px] rounded-[calc(theme(borderRadius.2xl)-1px)] border border-white/6" />
      <img
        alt=""
        className="relative z-10 h-auto w-[62px] object-contain drop-shadow-[0_8px_22px_rgba(0,0,0,0.4)] sm:w-[75px]"
        height={45}
        src={studySphereLogo}
        width={75}
      />
    </div>
  );
}
