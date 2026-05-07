import { getSession } from "@/lib/auth";
import { Header } from "@/components/ui/header-2";

export default async function MarketingHeader() {
  const session = await getSession();
  return <Header signedIn={session != null} />;
}
