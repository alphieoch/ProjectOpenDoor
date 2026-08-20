import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 py-16 text-center">
      <DoorOpen className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        That URL is not a page on OpenDoor. Nothing here is a placeholder — go back to a real route.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonVariants({ size: "sm" })}>
          Home
        </Link>
        <Link href="/login" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Sign in
        </Link>
        <Link href="/dashboard" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Dashboard
        </Link>
      </div>
    </div>
  );
}
