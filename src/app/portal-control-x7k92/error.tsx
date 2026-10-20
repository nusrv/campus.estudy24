"use client";
import { Button } from "@/components/ui/button";
export default function AdminError({ reset }: { reset: () => void }) { return <div className="mx-auto max-w-xl p-10 text-center"><h1 className="text-xl font-medium">تعذّر تحميل مساحة الإدارة</h1><p className="my-5 text-sm leading-7 text-secondary-foreground">تحقّق من اتصال قاعدة البيانات وإعدادات الخادم، ثم أعد المحاولة.</p><Button onClick={reset}>إعادة المحاولة</Button></div>; }
