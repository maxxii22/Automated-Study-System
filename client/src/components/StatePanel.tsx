import type { ReactNode } from "react";

type StatePanelProps = {
  eyebrow: string;
  title: string;
  copy: string;
  tone?: "default" | "error";
  actions?: ReactNode;
};

export function StatePanel({ eyebrow, title, copy, tone = "default", actions }: StatePanelProps) {
  return (
    <section className={tone === "error" ? "state-panel state-panel-error" : "state-panel"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="muted">{copy}</p>
      {actions ? <div className="state-panel-actions">{actions}</div> : null}
    </section>
  );
}
