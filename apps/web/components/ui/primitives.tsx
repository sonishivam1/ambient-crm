import Link from "next/link";
import type { ReactNode } from "react";

import type { HealthBand } from "@ambient/db";

import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

export function PageHead({
  eyebrow,
  title,
  meta,
  sub,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="title">
          {title}
          {meta && <small>{meta}</small>}
        </h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  link,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  link?: { href: string; label: string } | ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const linkNode =
    link && typeof link === "object" && "href" in link ? (
      <Link className="card-link" href={link.href}>
        {link.label}
      </Link>
    ) : (
      link
    );
  return (
    <div className={cn("card", className)}>
      {title && (
        <div className="card-h">
          <h3>{title}</h3>
          {linkNode}
        </div>
      )}
      <div className={cn("card-b", bodyClassName)}>{children}</div>
    </div>
  );
}

export type Tone = "ok" | "warn" | "risk" | "info" | "accent" | "dark" | "out";

export function Badge({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("bdg", tone)}>{children}</span>;
}

const HEALTH_LABEL: Record<HealthBand, string> = { g: "Healthy", a: "Watch", r: "At risk" };

export function HealthPill({ band }: { band: HealthBand | null }) {
  return <span className={cn("hp", band ?? "n")}>{band ? HEALTH_LABEL[band] : "—"}</span>;
}

export function Avatar({ name, size, tint }: { name: string; size?: "sm" | "lg"; tint?: 1 | 2 | 3 | 4 | 5 }) {
  return <span className={cn("avatar", size, tint && `c${tint}`)}>{name.startsWith("+") ? name : initials(name)}</span>;
}

export function ProgressBar({ pct, tone }: { pct: number; tone?: "ok" | "risk" | "dark" }) {
  return (
    <div className={cn("bar", tone)}>
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Ring({
  pct,
  size = 92,
  stroke = 10,
  color = "var(--accent)",
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, pct / 100)));
  return (
    <div className="relative grid flex-none place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center leading-tight font-extrabold">{children}</div>
    </div>
  );
}

export function Dot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="dotn">
      <i style={{ background: color }} />
      {children}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

/** Pulsing placeholder block for loading states. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-2xl bg-surface3", className)} style={style} />;
}
