import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "link" | "destructive";
type Size = "sm" | "md" | "lg" | "xl";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand text-foreground shadow-md hover:bg-[color-mix(in_srgb,var(--color-brand),var(--color-brand-strong)_18%)] hover:shadow-lg",
  secondary: "bg-surface-raised text-foreground border border-border hover:border-border-strong hover:bg-brand-soft/40",
  ghost: "text-muted hover:bg-brand-soft hover:text-brand-strong",
  link: "text-brand-strong underline-offset-4 hover:underline px-0",
  destructive: "bg-danger-soft text-danger border border-danger/25 hover:bg-danger-soft/70",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-4 text-body-sm",
  md: "h-10 px-5 text-body-sm",
  lg: "h-12 px-6 text-body",
  xl: "h-14 px-8 text-body-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-semibold transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
