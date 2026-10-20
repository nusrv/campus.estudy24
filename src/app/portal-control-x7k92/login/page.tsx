import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { session } from "@/server/auth";
import { ADMIN_PATH } from "@/server/security";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/components/admin/login-form";
export default async function LoginPage() {
  if (await session()) redirect(ADMIN_PATH);
  return <main className="flex min-h-dvh items-center justify-center px-5 py-12"><Card className="w-full max-w-md"><CardContent className="space-y-7 p-8"><div><BookOpen className="mb-5 size-9 text-primary" /><h1 className="text-2xl font-medium">إدارة eStudy24</h1><p className="mt-3 text-sm leading-7 text-secondary-foreground">مساحة خاصة لإدارة المحتوى الجامعي.</p></div><LoginForm /><p className="border-t border-border pt-5 text-xs leading-6 text-secondary-foreground">هذه الواجهة مخصّصة للمشرفين المخوّلين فقط.</p></CardContent></Card></main>;
}
