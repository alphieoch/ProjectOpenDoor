import { getSession } from "@/lib/auth";
import { loadEnterpriseAccess } from "@/lib/enterprise";
import { EnterpriseGate } from "@/components/enterprise-gate";

export default async function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  let locked = true;
  if (session?.orgId) {
    try {
      const access = await loadEnterpriseAccess(session.orgId, session);
      locked = !access.active;
    } catch {
      locked = !session.isSiteAdmin;
    }
  }

  return (
    <EnterpriseGate locked={locked} feature="Governance">
      {children}
    </EnterpriseGate>
  );
}
