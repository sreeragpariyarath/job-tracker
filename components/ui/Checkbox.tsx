import type { ComponentProps, ReactNode } from "react";

type Props = Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: string };

export function Checkbox({ label, description, className = "", ...props }: Props) {
  return <label className={`flex cursor-pointer items-start gap-3 text-sm text-fg ${className}`}>
    <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer accent-sky-600 disabled:cursor-not-allowed disabled:opacity-50" {...props} />
    <span className="leading-5"><span className="font-medium">{label}</span>{description && <span className="mt-1 block text-xs text-muted">{description}</span>}</span>
  </label>;
}
