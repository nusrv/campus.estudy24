import { AccountForm } from '@/components/admin/account-form';
import { Card, CardContent } from '@/components/ui/card';
export default function ResetPage() {
  return <main className="flex min-h-dvh items-center justify-center px-5 py-12"><Card className="w-full max-w-md"><CardContent className="space-y-6 p-8"><h1 className="text-2xl font-medium">إعادة تعيين كلمة المرور</h1><p className="text-sm leading-7 text-secondary-foreground">استخدم الرمز المؤقت الذي سلّمه لك مالك البوابة عبر قناة آمنة.</p><AccountForm mode="reset" /></CardContent></Card></main>;
}
