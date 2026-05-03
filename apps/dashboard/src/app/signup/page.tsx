import { redirect } from "next/navigation";
import { normalizeOnboardingSegment } from "@/lib/onboarding";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const params = await searchParams;
  const segment = normalizeOnboardingSegment(params.segment);
  redirect(`/login?signup=1&segment=${segment}`);
}
