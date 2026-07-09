import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--fill)] px-4 py-2 text-sm text-foreground backdrop-blur-xl transition-colors cursor-text",
        "placeholder:text-muted-foreground/70",
        "hover:border-[var(--line-strong)] focus:border-[var(--line-strong)] focus:bg-[var(--fill)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
