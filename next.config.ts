import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@excalidraw/excalidraw', 'roughjs', 'browser-fs-access'],
};

export default nextConfig;
