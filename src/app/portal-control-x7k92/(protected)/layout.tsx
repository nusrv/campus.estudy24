import { clientCsrf, requireAdminPage } from "@/server/auth";
import { AdminShell } from "@/components/admin/shell";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAdminPage();
  return <AdminShell csrf={clientCsrf(auth.tokenHash)} name={auth.administrator.name} role={auth.administrator.role}>{children}</AdminShell>;
}
