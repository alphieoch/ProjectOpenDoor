import { redirectIfProtectedChild } from "@/lib/redirect-protected-child";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  await redirectIfProtectedChild();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {children}
    </div>
  );
}
