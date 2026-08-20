export default function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900 dark:border-zinc-800 dark:border-t-white"
        role="status"
        aria-label="Loading sign in"
      />
    </div>
  );
}
