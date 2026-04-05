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
        "relative isolate flex items-center justify-center overflow-hidden rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[0_14px_34px_rgba(0,0,0,0.24)]",
        compact ? "size-[3.85rem] sm:size-[4.35rem]" : "size-[4.8rem] sm:size-[5.4rem]",
        className
      )}
    >
      <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_22%_20%,rgba(255,193,122,0.12),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(91,152,255,0.08),transparent_40%)]" />
      <img
        alt=""
        className="relative z-10 h-auto w-[76px] object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.34)] sm:w-[86px]"
        height={45}
        src={studySphereLogo}
        width={75}
      />
    </div>
  );
}
