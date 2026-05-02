import { Suspense } from "react";
import { redirect } from "next/navigation";

export default function SignupPage() {
  // Redirect to login page with signup mode
  redirect("/login?signup=1");
}
