import { Suspense } from "react";
import InviteForm from "./InviteForm";

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
        </div>
      }
    >
      <InviteForm />
    </Suspense>
  );
}
