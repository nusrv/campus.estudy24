import * as React from "react";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("rounded-[18px] border border-border bg-card", className)} {...props} />; }
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("space-y-2 p-6 pb-0", className)} {...props} />; }
export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) { return <h3 className={cn("text-lg font-medium leading-relaxed", className)} {...props} />; }
export function CardContent({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("p-6", className)} {...props} />; }
