import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold backdrop-blur-xl transition-colors",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-foreground text-background",
        secondary:   "border-white/10 bg-white/[0.08] text-foreground/90",
        destructive: "border-red-400/30 bg-destructive/25 text-red-200",
        outline:     "border-white/15 bg-transparent text-muted-foreground",
        success:     "border-[hsl(162_40%_52%/0.3)] bg-[hsl(162_40%_52%/0.12)] text-[hsl(162_40%_62%)]",
        live:        "border-[hsl(162_40%_52%/0.3)] bg-[hsl(162_40%_52%/0.12)] text-[hsl(162_40%_62%)]",
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
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(162_40%_55%)] opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(162_40%_55%)]" />
        </span>
      )}
      {children}
    </div>
  );
}
