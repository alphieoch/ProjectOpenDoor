import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { aiAssistants } from "@opendoor/database";
import { eq } from "drizzle-orm";
import { ChatInterface } from "./ChatInterface";
import { Bot } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PublicChatPage({ params }: Props) {
  const { slug } = await params;
  const db = getDb();

  const [assistant] = await db
    .select()
    .from(aiAssistants)
    .where(eq(aiAssistants.slug, slug));

  if (!assistant || !assistant.enabled || !assistant.publishedAt) {
    notFound();
  }

  // Access control
  if (assistant.visibility === "private") {
    return <AccessDenied message="This assistant is private." />;
  }

  if (assistant.visibility === "team") {
    const session = await getSession();
    if (!session || session.orgId !== assistant.organizationId) {
      redirect(`/login?redirect=/ai/${slug}`);
    }
  }

  const primaryColor = assistant.primaryColor ?? "#1A73E8";
  const avatarLetter = assistant.avatarLetter ?? assistant.name.charAt(0).toUpperCase();

  return (
    <div
      className="flex flex-col h-dvh bg-[var(--paper)] text-[var(--ink)]"
      style={{ fontFamily: "inherit" }}
    >
      {/* Branded header */}
      <header
        className="flex-shrink-0 flex items-center gap-3 px-5 py-4 shadow-sm"
        style={{ background: primaryColor }}
      >
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold text-lg select-none">
          {avatarLetter}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-white font-semibold text-base leading-tight truncate">
            {assistant.name}
          </span>
          {assistant.description && (
            <span className="text-white/70 text-xs leading-tight truncate">
              {assistant.description}
            </span>
          )}
        </div>

        {/* Powered-by badge */}
        <div className="ml-auto flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
          <Bot className="w-3.5 h-3.5 text-white/80" />
          <span className="text-white/80 text-xs font-medium">OpenDoor AI</span>
        </div>
      </header>

      {/* Chat */}
      <ChatInterface
        slug={slug}
        welcomeMessage={assistant.welcomeMessage}
        primaryColor={primaryColor}
        avatarLetter={avatarLetter}
        maxMessages={assistant.maxMessages}
      />
    </div>
  );
}

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-[var(--paper)] text-[var(--ink)]">
      <div className="w-16 h-16 rounded-2xl bg-[var(--paper-3)] flex items-center justify-center">
        <Bot className="w-8 h-8 text-[var(--ink-3)]" />
      </div>
      <h1 className="text-xl font-semibold">{message}</h1>
      <p className="text-sm text-[var(--ink-3)]">
        Contact the assistant owner for access.
      </p>
    </div>
  );
}
