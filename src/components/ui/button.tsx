import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold cursor-pointer transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--brand))] text-[hsl(var(--brand-foreground))] hover:opacity-90 shadow-[0_1px_8px_hsl(var(--foreground)/0.08),inset_0_1px_0_hsl(var(--foreground)/0.25)]",
        destructive:
          "bg-destructive/80 text-destructive-foreground backdrop-blur-xl border border-[hsl(var(--destructive)/0.4)] hover:bg-destructive/90",
        outline:
          "border border-[var(--line-strong)] bg-[var(--fill)] backdrop-blur-xl text-foreground hover:bg-[var(--fill-hover)] hover:border-[var(--line-strong)] shadow-[inset_0_1px_0_hsl(var(--foreground)/0.12)]",
        secondary:
          "bg-[var(--fill)] backdrop-blur-xl border border-[var(--line)] text-foreground hover:bg-[var(--fill-hover)] shadow-[inset_0_1px_0_hsl(var(--foreground)/0.1)]",
        ghost: "text-foreground/80 hover:bg-[var(--fill-hover)] hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
