import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { userIsProtectedChild } from "@/lib/parent-protection";

/** Redirect parent-protected seats away from Playground / Studio / Media. */
export async function redirectIfProtectedChild() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (await userIsProtectedChild(session.userId)) {
    redirect("/dashboard/chat");
  }
}
