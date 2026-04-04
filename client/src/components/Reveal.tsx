import type { PropsWithChildren } from "react";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/utils";

type RevealProps = PropsWithChildren<
  HTMLMotionProps<"div"> & {
    delay?: number;
    distance?: number;
  }
>;

export function Reveal({ children, className, delay = 0, distance = 28, ...props }: RevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className={cn(className)}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: distance }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
