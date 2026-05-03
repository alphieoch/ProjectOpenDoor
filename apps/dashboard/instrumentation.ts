export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { shutdownPostHog } = await import("./src/lib/posthog-server");
    const onShutdown = () => {
      void shutdownPostHog();
    };
    process.on("beforeExit", onShutdown);
  }
}
