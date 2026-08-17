# Nuxt AI Chatbot Template

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

Full-featured AI Chatbot Nuxt application with authentication, chat history, collapsible sidebar, keyboard shortcuts, light & dark mode, command palette and more. Built using [Nuxt UI](https://ui.nuxt.com) components and integrated with [AI SDK](https://ai-sdk.dev) for a complete chat experience.

- [Live demo](https://chat-template.nuxt.dev/)
- [Documentation](https://ui.nuxt.com/docs/getting-started/installation/nuxt)

<a href="https://chat-template.nuxt.dev/" target="_blank">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://ui.nuxt.com/assets/templates/nuxt/chat-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://ui.nuxt.com/assets/templates/nuxt/chat-light.png">
    <img alt="Nuxt AI Chatbot Template" src="https://ui.nuxt.com/assets/templates/nuxt/chat-light.png">
  </picture>
</a>

> The chat template for Vue is on https://github.com/nuxt-ui-templates/chat-vue.

## Features

- ⚡️ **Streaming AI messages** powered by the [AI SDK](https://ai-sdk.dev) with thinking/reasoning support
- 🤖 **Multiple model support** — OpenDoor catalog models via the OpenAI-compatible gateway (`OPENDOOR_API_KEY`)
- 🔍 **Web search** with built-in provider tools (Anthropic, OpenAI)
- 📊 **Charts and weather** tool calling with rich UI rendering
- 🔐 **Authentication** via GitHub OAuth using [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils)
- 💾 **Chat history persistence** using SQLite database ([Turso](https://turso.tech) in production) and [Drizzle ORM](https://orm.drizzle.team)
- 📎 **File uploads** with drag & drop using [NuxtHub Blob](https://hub.nuxt.com/docs/blob) (requires authentication)
- ✨ **Markdown rendering** with streaming code highlighting via [Comark](https://comark.dev)

## Quick Start

```bash
npm create nuxt@latest -- -t ui/chat
```

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnuxt-ui-templates%2Fchat&repository-name=chat&env=NUXT_OAUTH_GITHUB_CLIENT_ID%2CNUXT_OAUTH_GITHUB_CLIENT_SECRET%2CNUXT_SESSION_PASSWORD&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22tursocloud%22%2C%22productSlug%22%3A%22database%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%7D%5D&demo-title=Nuxt+Chat+Template&demo-description=An+AI+chatbot+template+with+GitHub+authentication+and+persistent+chat+history+powered+by+Vercel+AI+SDK.&demo-url=https%3A%2F%2Fchat-template.nuxt.dev&demo-image=https%3A%2F%2Fui.nuxt.com%2Fassets%2Ftemplates%2Fnuxt%2Fchat-dark.png)

## Setup

Make sure to install the dependencies:

```bash
pnpm install
```

Run database migrations:

```bash
pnpm db:migrate
```

> [!NOTE]
> In production, configure your database connection. On Vercel, add the [Turso integration](https://vercel.com/integrations/turso) to automatically provision `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

### AI Integration

Point this app at the OpenDoor gateway (OpenAI-compatible `POST /v1/chat/completions`). From `apps/chat`:

```bash
OPENDOOR_API_KEY=opd_...
OPENDOOR_BASE_URL=http://localhost:3001   # default
pnpm dev   # or bun
```

When `OPENDOOR_API_KEY` is set, `server/api/ai/[slug]/chat.post.ts` streams from `${OPENDOOR_BASE_URL}/v1` via `@ai-sdk/openai`. Assistant billing/limits on the dashboard are skipped on that path.

If the key is unset, the handler still proxies to the Next.js dashboard (`NEXTJS_API_URL`, default `http://localhost:3000`) at `/api/ai/:slug/chat`.

Default model: `gemma-4-26b-a4b-it` (Vertex Model Garden). Change it in the model picker.

### Authentication (Optional)

This template uses [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) for authentication with GitHub OAuth.

To enable authentication, [create a GitHub OAuth application](https://github.com/settings/applications/new) and set:

```bash
NUXT_OAUTH_GITHUB_CLIENT_ID=<your-github-oauth-app-client-id>
NUXT_OAUTH_GITHUB_CLIENT_SECRET=<your-github-oauth-app-client-secret>
NUXT_SESSION_PASSWORD=<your-password-minimum-32-characters>
```

### Blob Storage (Optional)

This template uses [NuxtHub Blob](https://hub.nuxt.com/docs/blob) for file uploads, which supports multiple storage drivers:

- **Local filesystem** (default for development, stored in `.data/blob`)
- **[Vercel Blob](https://vercel.com/docs/vercel-blob)** (auto-configured when deployed to Vercel)
- **[Cloudflare R2](https://hub.nuxt.com/docs/blob#set-a-driver)** (when deployed to Cloudflare)
- **[Amazon S3](https://hub.nuxt.com/docs/blob#set-a-driver)** (with manual configuration)

For **Vercel Blob**, assign a Blob Store to your project from the Vercel dashboard (Project → Storage), then set the token for local development:

```bash
BLOB_READ_WRITE_TOKEN=<your-vercel-blob-token>
```

> [!NOTE]
> File uploads require authentication. See the [NuxtHub Blob documentation](https://hub.nuxt.com/docs/blob#set-a-driver) for configuring other storage drivers.

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Renovate integration

Install [Renovate GitHub app](https://github.com/apps/renovate/installations/select_target) on your repository and you are good to go.
