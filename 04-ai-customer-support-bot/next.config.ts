import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Standalone output is only needed for the Docker image; enabling it breaks
  // `next start` (used by tests and Vercel). The Dockerfile sets BUILD_STANDALONE=1.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  serverExternalPackages: ["pdf-parse", "pino"],
  async headers() {
    return [
      {
        // Everything except the widget, which must be iframe-embeddable anywhere.
        source: "/((?!widget).*)",
        headers: [...securityHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/widget/:path*",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
