"use client";
import { Button } from "@/components/ui/button";
export default function PublicError({ reset }: { reset: () => void }) { return <div className="rounded-[18px] border border-border bg-white p-10 text-center"><h1 className="text-xl font-medium">تعذّر تحميل المحتوى</h1><p className="my-5 text-sm leading-8 text-secondary-foreground">يرجى إعادة المحاولة بعد قليل.</p><Button onClick={reset}>إعادة المحاولة</Button></div>; }
