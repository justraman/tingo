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
          "bg-foreground text-background hover:bg-foreground/90 shadow-[0_2px_16px_hsl(0_0%_100%/0.15),inset_0_1px_0_hsl(0_0%_100%/0.6)]",
        destructive:
          "bg-destructive/80 text-destructive-foreground backdrop-blur-xl border border-red-400/30 hover:bg-destructive/90",
        outline:
          "border border-white/15 bg-white/[0.06] backdrop-blur-xl text-foreground hover:bg-white/[0.12] hover:border-white/25 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.12)]",
        secondary:
          "bg-white/[0.08] backdrop-blur-xl border border-white/10 text-foreground hover:bg-white/[0.14] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.1)]",
        ghost: "text-foreground/80 hover:bg-white/[0.08] hover:text-foreground",
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
