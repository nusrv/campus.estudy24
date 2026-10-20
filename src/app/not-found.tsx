import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <div className="mx-auto max-w-xl px-5 py-24 text-center"><span className="text-sm text-primary">eStudy24 Campus</span><h1 className="mt-5 text-3xl font-medium">الصفحة غير موجودة</h1><p className="my-6 text-sm leading-8 text-secondary-foreground">قد يكون الرابط تغيّر أو أن المحتوى لم يعد متاحًا.</p><Button asChild><Link href="/">العودة للرئيسية</Link></Button></div>; }
