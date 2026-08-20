export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06111f]">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-cyan-200"
        role="status"
        aria-label="Loading onboarding"
      />
    </div>
  );
}
