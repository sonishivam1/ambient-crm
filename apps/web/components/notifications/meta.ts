import { Bell, CalendarClock, CalendarDays, NotebookText, Sparkles, SquareCheck, TriangleAlert, type LucideIcon } from "lucide-react";

import type { Notification } from "@ambient/db/models";

/** How each notification type looks: icon, tone (an `.ic` modifier) and label. Shared by the dashboard and /notifications. */
export const NOTIFICATION_META: Record<Notification["type"], { icon: LucideIcon; tone: string; label: string }> = {
  at_risk_change: { icon: TriangleAlert, tone: "risk", label: "At-risk change" },
  contract_renewal: { icon: NotebookText, tone: "warn", label: "Contract renewal" },
  ai_suggestion: { icon: Sparkles, tone: "acc", label: "Wren suggestion" },
  task_assigned: { icon: SquareCheck, tone: "info", label: "Task assigned" },
  email_flagged: { icon: Bell, tone: "warn", label: "Flagged email" },
  visit_reminder: { icon: CalendarDays, tone: "ok", label: "Visit reminder" },
  visit_assigned: { icon: CalendarClock, tone: "info", label: "Visit booked" },
};
