import { redirect } from "next/navigation";
import { resolveSignupIntent } from "@/lib/signup-plan";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const intent = resolveSignupIntent({ plan: params.plan, segment: params.segment });
  const qs = new URLSearchParams({ signup: "1", segment: intent.segment });
  if (intent.plan) qs.set("plan", intent.plan);
  redirect(`/login?${qs.toString()}`);
}
