import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  allowedDevOrigins: ['10.55.98.86'],
};

export default nextConfig;