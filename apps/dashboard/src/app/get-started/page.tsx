import MarketingHeader from "@/components/MarketingHeader";
import { GetStartedView } from "@/components/i18n/get-started-view";

export default function GetStartedPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <GetStartedView />
    </main>
  );
}
