import { Bell, Building2, CalendarDays, ListChecks, MessageSquareText, NotebookText, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, HealthPill, type Tone } from "@/components/ui/primitives";
import type {
  AccountCardData,
  AiCardData,
  ContactCardData,
  ContractCardData,
  InteractionCardData,
  NotificationCardData,
  TaskCardData,
  VisitCardData,
} from "@/lib/ai/cards";
import { cn } from "@/lib/cn";
import { BAND } from "@/lib/contracts";

/**
 * Cards for the records an AI answer cites. They render card data built on the
 * server from the user's own scoped records, never model text, so every name,
 * date and amount on them is real. Each links to where the record lives.
 */

function Shell({ href, icon, tone, title, meta, aside, children }: {
  href: string;
  icon: ReactNode;
  tone?: "acc" | "ok" | "warn" | "risk" | "info";
  title: string;
  meta: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Link href={href} className="ai-card">
      <span className={cn("ic", tone)} aria-hidden>
        {icon}
      </span>
      <span className="ai-card-b">
        <b>{title}</b>
        <span className="ai-card-m">{meta}</span>
        {children}
      </span>
      {aside && <span className="ai-card-a">{aside}</span>}
    </Link>
  );
}

const PRIORITY: Record<TaskCardData["priority"], [string, Tone]> = { high: ["High", "risk"], normal: ["Medium", "warn"], low: ["Low", "out"] };
const SENTIMENT_TONE: Record<NonNullable<VisitCardData["sentiment"]>, Tone> = { positive: "ok", neutral: "info", negative: "risk" };

export function AccountCard({ card }: { card: AccountCardData }) {
  return (
    <Shell href={card.href} icon={<Building2 size={17} />} tone="acc" title={card.name} meta={[card.typeLabel, card.owner, `${card.fyRevenue} FY`].filter(Boolean).join(" · ")} aside={<HealthPill band={card.health} />} />
  );
}

export function TaskCard({ card }: { card: TaskCardData }) {
  const [label, tone] = PRIORITY[card.priority];
  return (
    <Shell
      href={card.href}
      icon={<ListChecks size={17} />}
      tone={card.overdue ? "risk" : undefined}
      title={card.title}
      meta={
        <>
          {card.account && `${card.account} · `}
          <span className={cn(card.overdue && "ai-card-late")}>{card.overdue ? `Overdue · due ${card.due}` : `Due ${card.due}`}</span>
          {` · ${card.statusLabel}`}
        </>
      }
      aside={<Badge tone={tone}>{label}</Badge>}
    />
  );
}

export function VisitCard({ card }: { card: VisitCardData }) {
  const tone: Tone = card.sentiment ? SENTIMENT_TONE[card.sentiment] : card.statusLabel === "Overdue" ? "risk" : "info";
  return (
    <Shell
      href={card.href}
      icon={<CalendarDays size={17} />}
      tone="info"
      title={`${card.typeLabel} · ${card.account}`}
      meta={card.when}
      aside={<Badge tone={tone}>{card.statusLabel}</Badge>}
    >
      {card.purpose && <span className="ai-card-t">{card.purpose}</span>}
    </Shell>
  );
}

export function ContractCard({ card }: { card: ContractCardData }) {
  return (
    <Shell
      href={card.href}
      icon={<NotebookText size={17} />}
      title={card.name}
      meta={[card.account, card.value, `ends ${card.end}`].filter(Boolean).join(" · ")}
      aside={<Badge tone={BAND[card.band].tone}>{card.daysLeftLabel}</Badge>}
    />
  );
}

export function ContactCard({ card }: { card: ContactCardData }) {
  return (
    <Shell href={card.href} icon={<UserRound size={17} />} title={card.name} meta={card.jobTitle || "—"}>
      {card.roles.length > 0 && <span className="ai-card-t">{card.roles.join(" · ")}</span>}
      {(card.email || card.phone) && <span className="ai-card-m">{[card.email, card.phone].filter(Boolean).join(" · ")}</span>}
    </Shell>
  );
}

export function InteractionCard({ card }: { card: InteractionCardData }) {
  return (
    <Shell href={card.href} icon={<MessageSquareText size={17} />} title={card.typeLabel} meta={[card.date, card.by].filter(Boolean).join(" · ")}>
      {card.summary && <span className="ai-card-t">{card.summary}</span>}
    </Shell>
  );
}

export function NotificationCard({ card }: { card: NotificationCardData }) {
  return (
    <Shell href={card.href} icon={<Bell size={17} />} tone="warn" title={card.title} meta={card.when}>
      {card.body && <span className="ai-card-t">{card.body}</span>}
    </Shell>
  );
}

export function AiCard({ card }: { card: AiCardData }) {
  switch (card.kind) {
    case "account":
      return <AccountCard card={card} />;
    case "task":
      return <TaskCard card={card} />;
    case "visit":
      return <VisitCard card={card} />;
    case "contract":
      return <ContractCard card={card} />;
    case "contact":
      return <ContactCard card={card} />;
    case "interaction":
      return <InteractionCard card={card} />;
    case "notification":
      return <NotificationCard card={card} />;
  }
}

/** The cards behind an answer, in the order the answer cites them. */
export function AiCards({ cards, className }: { cards: AiCardData[]; className?: string }) {
  if (!cards.length) return null;
  return (
    <div className={cn("ai-cards", className)}>
      {cards.map((c) => (
        <AiCard key={c.handle} card={c} />
      ))}
    </div>
  );
}
