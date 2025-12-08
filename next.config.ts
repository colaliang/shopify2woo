import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // 允许被扩展弹窗 iframe 嵌入
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/docs",
        destination: "/docs/index.html",
      },
    ];
  },
};

export default nextConfig;
