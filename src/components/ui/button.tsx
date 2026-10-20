import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/25 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4", {
  variants: {
    variant: { default: "bg-primary text-white hover:bg-[#10664f]", secondary: "bg-accent text-primary hover:bg-[#d2eae1]", outline: "border border-border bg-white text-foreground hover:bg-muted", ghost: "text-secondary-foreground hover:bg-muted hover:text-foreground", destructive: "bg-[#fff0ef] text-[#b54740] hover:bg-[#ffe3e1]" },
    size: { default: "h-11 px-5", sm: "h-9 px-3 text-xs", lg: "h-12 px-6", icon: "size-10" },
  }, defaultVariants: { variant: "default", size: "default" },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
