import { EmailClient } from "@azure/communication-email";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let _emailClient: EmailClient | null = null;

function getEmailClient(): EmailClient | null {
  if (_emailClient) return _emailClient;
  const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  if (!connectionString) {
    console.warn(
      "AZURE_COMMUNICATION_CONNECTION_STRING not set — emails will be logged to console only"
    );
    return null;
  }
  _emailClient = new EmailClient(connectionString);
  return _emailClient;
}

function getSenderEmail(): string {
  return (
    process.env.EMAIL_SENDER_ADDRESS ||
    "noreply@opendoor.ai"
  );
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const client = getEmailClient();
  const sender = getSenderEmail();

  if (!client) {
    console.log("[EMAIL] Would send email:");
    console.log(`  To: ${options.to}`);
    console.log(`  Subject: ${options.subject}`);
    console.log(`  Body: ${options.html.slice(0, 200)}...`);
    return;
  }

  try {
    const poller = await client.beginSend({
      senderAddress: sender,
      content: {
        subject: options.subject,
        html: options.html,
        plainText: options.text || options.html.replace(/<[^>]+>/g, ""),
      },
      recipients: {
        to: [{ address: options.to }],
      },
    });

    await poller.pollUntilDone();
    console.log(`[EMAIL] Sent to ${options.to}: ${options.subject}`);
  } catch (err) {
    console.error("[EMAIL] Failed to send email:", err);
    throw err;
  }
}

export function buildInviteEmail({
  inviteeEmail: _inviteeEmail,
  orgName,
  invitedByName,
  inviteLink,
  role,
}: {
  inviteeEmail: string;
  orgName: string;
  invitedByName: string;
  inviteLink: string;
  role: string;
}): { subject: string; html: string; text: string } {
  const subject = `You've been invited to join ${orgName} on OpenDoor`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px; }
    .logo { font-size: 24px; font-weight: bold; color: #4f46e5; margin-bottom: 24px; }
    .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; }
    .button { display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .footer { margin-top: 32px; font-size: 12px; color: #9ca3af; }
    .role-badge { display: inline-block; background: #f3f4f6; color: #4b5563; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="logo">🚪 OpenDoor</div>
  <div class="card">
    <h2 style="margin-top: 0;">You're invited!</h2>
    <p><strong>${invitedByName}</strong> has invited you to join <strong>${orgName}</strong> on OpenDoor as a <span class="role-badge">${role}</span>.</p>
    <p>OpenDoor gives your team unified access to GPT-4o, Claude, Gemini, Mistral, DeepSeek, Qwen, and more through a single API.</p>
    <a href="${inviteLink}" class="button">Accept Invitation</a>
    <p style="font-size: 13px; color: #6b7280;">Or copy this link: <code style="word-break: break-all;">${inviteLink}</code></p>
    <p style="font-size: 13px; color: #6b7280;">This invitation expires in 7 days.</p>
  </div>
  <div class="footer">
    OpenDoor — Multi-tenant LLM API Gateway<br>
    If you didn't expect this invitation, you can safely ignore this email.
  </div>
</body>
</html>
  `.trim();

  const text = `
You've been invited to join ${orgName} on OpenDoor

${invitedByName} has invited you to join ${orgName} as a ${role}.

Accept your invitation: ${inviteLink}

This invitation expires in 7 days.
  `.trim();

  return { subject, html, text };
}
