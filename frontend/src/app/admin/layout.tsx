import type { ReactNode } from "react";

import AdminGuard from "@/component/admin/AdminGuard";
import AdminShell from "@/component/admin/AdminShell";

export default function AdminLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <AdminGuard>
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}
