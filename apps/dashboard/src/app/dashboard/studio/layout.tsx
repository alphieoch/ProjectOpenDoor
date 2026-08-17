import { redirectIfProtectedChild } from "@/lib/redirect-protected-child";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  await redirectIfProtectedChild();
  return (
    <div className="od-studio flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
