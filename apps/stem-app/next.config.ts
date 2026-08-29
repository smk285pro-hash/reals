import type { NextConfig } from "next";

// Backend FastAPI mặc định chạy cùng VPS (Bước 4 monorepo — trước đây là Modal).
// Override bằng env BACKEND_API_URL / NEXT_PUBLIC_API_URL khi cần.
const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:3031";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // packages/auth-client ship TypeScript thô (main: ./src/index.ts) — cần
  // transpile khi import từ app Next.js
  transpilePackages: ["@reals/auth-client"],
  experimental: {
    middlewareClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
