import { redirect } from "next/navigation";

export default function StatusPage() {
  const cachetUrl = process.env.CACHET_URL || "/";
  redirect(cachetUrl);
}
