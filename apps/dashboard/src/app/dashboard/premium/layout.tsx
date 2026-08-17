import { redirectIfProtectedChild } from "@/lib/redirect-protected-child";

export default async function PremiumLayout({ children }: { children: React.ReactNode }) {
  await redirectIfProtectedChild();
  return children;
}
