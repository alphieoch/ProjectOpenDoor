export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireSiteAdmin } from "@/lib/auth";

export default async function AdminOverviewRedirect() {
  await requireSiteAdmin();
  redirect("/dashboard/admin");
}
