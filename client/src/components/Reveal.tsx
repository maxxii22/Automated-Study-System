import type { PropsWithChildren } from "react";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/utils";

type RevealProps = PropsWithChildren<
  HTMLMotionProps<"div"> & {
    delay?: number;
    distance?: number;
    revealOnScroll?: boolean;
  }
>;

export function Reveal({
  children,
  className,
  delay = 0,
  distance = 28,
  revealOnScroll = false,
  ...props
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const shouldRevealOnScroll = revealOnScroll && !reduceMotion;

  return (
    <motion.div
      animate={shouldRevealOnScroll ? undefined : { opacity: 1, y: 0 }}
      className={cn(className)}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: distance }}
      viewport={shouldRevealOnScroll ? { once: true, amount: 0.18 } : undefined}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
      whileInView={shouldRevealOnScroll ? { opacity: 1, y: 0 } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
