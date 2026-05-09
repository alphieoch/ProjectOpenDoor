import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Composio handles OAuth internally; we just redirect back to the dashboard
  // The client polls our API to detect when the connection becomes active
  return NextResponse.redirect(
    new URL("/dashboard/ai-assistants?connected=1", req.url),
  );
}
