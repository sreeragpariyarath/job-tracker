import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "default" | "quiet" | "danger" | "confirm";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg border-accent hover:bg-accent-hover hover:border-accent-hover font-semibold shadow-xs",
  default: "bg-surface text-fg border-line hover:bg-subtle hover:border-zinc-700/60",
  quiet: "bg-transparent border-transparent text-muted hover:bg-subtle hover:text-fg",
  danger: "bg-transparent border-status-rejected/40 text-status-rejected hover:bg-status-rejected/10 hover:border-status-rejected/60",
  confirm: "bg-status-rejected text-white border-status-rejected hover:opacity-90",
};

const sizes = {
  md: "min-h-10 rounded-lg px-4 text-sm",
  lg: "min-h-11 rounded-lg px-5 text-sm",
};

type Props = ComponentProps<"button"> & { variant?: ButtonVariant; size?: keyof typeof sizes };

export function Button({ variant = "default", size = "md", className, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 border font-medium whitespace-nowrap cursor-pointer transition-colors select-none",
        sizes[size],
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}
