import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold backdrop-blur-xl transition-colors",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-[hsl(var(--brand))] text-[hsl(var(--brand-foreground))]",
        secondary:   "border-[var(--line)] bg-[var(--fill)] text-foreground/90",
        destructive: "border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.2)] text-[hsl(var(--destructive-foreground))]",
        outline:     "border-[var(--line-strong)] bg-transparent text-muted-foreground",
        success:     "border-[hsl(var(--ok)/0.35)] bg-[hsl(var(--ok)/0.14)] text-[hsl(var(--ok-foreground))]",
        live:        "border-[hsl(var(--ok)/0.35)] bg-[hsl(var(--ok)/0.14)] text-[hsl(var(--ok-foreground))]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {variant === "live" && (
        <span className="relative mr-1.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--ok))] opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--ok))]" />
        </span>
      )}
      {children}
    </div>
  );
}
