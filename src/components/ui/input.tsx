import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-foreground backdrop-blur-xl transition-colors cursor-text",
        "placeholder:text-muted-foreground/70",
        "hover:border-white/20 focus:border-white/30 focus:bg-white/[0.07]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "[color-scheme:dark]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
