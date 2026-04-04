import { Link, type LinkProps, type To } from "react-router-dom";

import { preloadRoute } from "@/lib/routePreload";

function toPathname(to: To) {
  if (typeof to === "string") {
    return to;
  }

  return to.pathname ?? null;
}

export function PrefetchLink({ onFocus, onMouseEnter, onTouchStart, to, ...props }: LinkProps) {
  const prefetch = () => {
    const pathname = toPathname(to);

    if (pathname) {
      void preloadRoute(pathname);
    }
  };

  return (
    <Link
      {...props}
      onFocus={(event) => {
        prefetch();
        onFocus?.(event);
      }}
      onMouseEnter={(event) => {
        prefetch();
        onMouseEnter?.(event);
      }}
      onTouchStart={(event) => {
        prefetch();
        onTouchStart?.(event);
      }}
      to={to}
    />
  );
}
