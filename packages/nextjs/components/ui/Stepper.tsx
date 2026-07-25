import { cn } from "@/lib/utils/cn";
import { Check } from "lucide-react";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <>
      <p className="font-mono text-overline uppercase text-muted sm:hidden">
        Step {Math.min(current + 1, steps.length)} of {steps.length} — {steps[Math.min(current, steps.length - 1)]}
      </p>

      <ol className="hidden items-center gap-2 sm:flex" aria-label="Progress">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-label transition-colors duration-[160ms]",
                    done && "border-brand bg-brand text-foreground",
                    active && "border-brand-strong bg-brand-soft font-semibold text-brand-strong",
                    !done && !active && "border-border text-subtle",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-label",
                    active ? "font-semibold text-foreground" : "text-muted",
                    !done && !active && "text-subtle",
                  )}
                >
                  {label}
                </span>
              </span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn("h-px flex-1 transition-colors duration-[160ms]", done ? "bg-brand" : "bg-border")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
