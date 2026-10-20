import type { ReactNode } from "react";
import OracleGuard from "@/component/oracle/OracleGuard";
import OracleShell from "@/component/oracle/OracleShell";

export default function OracleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <OracleGuard>
      <OracleShell>{children}</OracleShell>
    </OracleGuard>
  );
}
