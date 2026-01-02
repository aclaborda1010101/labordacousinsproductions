import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        pass: "border-transparent bg-[hsl(var(--qc-pass)/0.2)] text-[hsl(var(--qc-pass))]",
        fail: "border-transparent bg-[hsl(var(--qc-fail)/0.2)] text-[hsl(var(--qc-fail))]",
        pending: "border-transparent bg-[hsl(var(--qc-pending)/0.2)] text-[hsl(var(--qc-pending))]",
        blocked: "border-transparent bg-[hsl(var(--qc-blocked)/0.2)] text-[hsl(var(--qc-blocked))]",
        p0: "border-transparent bg-[hsl(var(--priority-p0)/0.2)] text-[hsl(var(--priority-p0))]",
        p1: "border-transparent bg-[hsl(var(--priority-p1)/0.2)] text-[hsl(var(--priority-p1))]",
        p2: "border-transparent bg-[hsl(var(--priority-p2)/0.2)] text-[hsl(var(--priority-p2))]",
        cine: "border-primary/30 bg-primary/10 text-primary",
        ultra: "border-transparent bg-gradient-to-r from-primary/20 to-amber-500/20 text-primary",
        hero: "border-transparent bg-gradient-to-r from-primary to-amber-500 text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
