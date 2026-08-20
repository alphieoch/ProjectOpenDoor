"use client";

import Link from "next/link";

export default function LoginError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Sign-in failed to load</h1>
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        Reload this page. If it keeps failing, go home and try again.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:text-white"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
