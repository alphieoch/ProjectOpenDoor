const posthogIngestHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const posthogAssetsHost = posthogIngestHost.includes("eu")
  ? "https://eu-assets.i.posthog.com"
  : "https://us-assets.i.posthog.com";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  transpilePackages: [
    "@opendoor/database",
    "@opendoor/shared",
    "border-beam",
    "liquid-gooey",
    "thinking-orbs",
  ],
  serverExternalPackages: ["postgres", "@duckdb/node-api"],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  skipTrailingSlashRedirect: true,
  outputFileTracingIncludes: {
    "/docs/[[...slug]]": ["../../docs/**/*", "../../docs.json"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push(/^@duckdb\//);
    }
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${posthogAssetsHost}/static/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${posthogIngestHost}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
