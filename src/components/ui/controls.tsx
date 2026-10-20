"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Select({ value, onValueChange, placeholder, options, id, label }: { value?: string; onValueChange?: (value: string) => void; placeholder: string; options: { value: string; label: string }[]; id?: string; label?: string }) {
  return <SelectPrimitive.Root dir="rtl" value={value} onValueChange={onValueChange}><SelectPrimitive.Trigger id={id} aria-label={label || placeholder} className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-3.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/10 data-[placeholder]:text-[#98a2b3]"><SelectPrimitive.Value placeholder={placeholder} /><SelectPrimitive.Icon><ChevronDown className="size-4 text-secondary-foreground" /></SelectPrimitive.Icon></SelectPrimitive.Trigger><SelectPrimitive.Portal><SelectPrimitive.Content position="popper" sideOffset={6} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-sm"><SelectPrimitive.Viewport>{options.map(option => <SelectPrimitive.Item key={option.value} value={option.value} className="relative flex cursor-pointer items-center rounded-lg py-2.5 ps-3 pe-9 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-primary"><SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator className="absolute end-3"><Check className="size-4" /></SelectPrimitive.ItemIndicator></SelectPrimitive.Item>)}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal></SelectPrimitive.Root>;
}

export function Checkbox({ id, checked, onCheckedChange, children }: { id: string; checked: boolean; onCheckedChange: (checked: boolean) => void; children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5"><CheckboxPrimitive.Root id={id} checked={checked} onCheckedChange={value => onCheckedChange(value === true)} className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[#cdd3da] bg-white outline-none focus-visible:ring-3 focus-visible:ring-primary/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white"><CheckboxPrimitive.Indicator><Check className="size-3.5" /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root><label htmlFor={id} className="cursor-pointer text-sm">{children}</label></div>;
}

export function Switch({ id, checked, onCheckedChange }: { id: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <SwitchPrimitive.Root dir="rtl" id={id} checked={checked} onCheckedChange={onCheckedChange} className="relative flex h-6 w-10 shrink-0 items-center justify-start rounded-full bg-[#d8dde3] p-0.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 data-[state=checked]:justify-end data-[state=checked]:bg-primary"><SwitchPrimitive.Thumb className="block size-5 rounded-full bg-white" /></SwitchPrimitive.Root>;
}

export function NavMenu({ label, items, active = false }: { label: string; items: { label: string; href: string }[]; active?: boolean }) {
  return <DropdownPrimitive.Root dir="rtl"><DropdownPrimitive.Trigger asChild><Button variant="ghost" size="sm" className={cn("gap-1.5", active && "bg-accent text-primary")}>{label}<ChevronDown className="size-3.5" /></Button></DropdownPrimitive.Trigger><DropdownPrimitive.Portal><DropdownPrimitive.Content align="start" sideOffset={10} className="z-50 min-w-44 rounded-xl border border-border bg-white p-1.5 shadow-sm">{items.map(item => <DropdownPrimitive.Item asChild key={item.href}><a href={item.href} className="block rounded-lg px-3 py-2.5 text-sm outline-none focus:bg-accent focus:text-primary">{item.label}</a></DropdownPrimitive.Item>)}</DropdownPrimitive.Content></DropdownPrimitive.Portal></DropdownPrimitive.Root>;
}
