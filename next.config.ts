import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator. Next 16 collapsed the old
  // `{ appIsrStatus, buildActivity }` flags into a single `false`; passing the
  // old keys fails the production type check.
  devIndicators: false,

  // Emit `.next/standalone` with a minimal server.js and only the traced
  // node_modules, so the deployed artifact doesn't need an `npm install`.
  output: "standalone",

  async headers() {
    return [
      {
        // /api/tts streams MP3 as it arrives from ElevenLabs. nginx and Vultr's
        // Load Balancer buffer proxied responses by default, which would hold
        // the whole clip back and delay Jazo's first word.
        source: "/api/tts",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
    ];
  },
};

export default nextConfig;
