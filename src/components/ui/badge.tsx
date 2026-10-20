import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium", { variants: { variant: { default: "bg-accent text-primary", neutral: "bg-muted text-secondary-foreground", blue: "bg-[#edf3fc] text-[#456f9c]", amber: "bg-[#fff5e5] text-[#996b23]", rose: "bg-[#f9edf2] text-[#a45977]", outline: "border border-border bg-white text-secondary-foreground" } }, defaultVariants: { variant: "default" } });
export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof variants>) { return <span className={cn(variants({ variant }), className)} {...props} />; }
