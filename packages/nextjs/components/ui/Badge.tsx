import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "success" | "danger" | "warning" | "info" | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-surface text-muted",
};

export function Badge({
  tone,
  dashed = false,
  className,
  children,
}: {
  tone: BadgeTone;
  dashed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 font-mono text-mono-sm font-medium",
        toneClasses[tone],
        dashed && "border border-dashed border-warning",
        className,
      )}
    >
      {children}
    </span>
  );
}
