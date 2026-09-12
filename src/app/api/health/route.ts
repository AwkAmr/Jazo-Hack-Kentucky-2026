import { NextResponse } from 'next/server';

/**
 * Liveness probe for the container healthcheck and Vultr's load balancer.
 *
 * Deliberately does not call Gemini/ElevenLabs — it answers "is the server
 * up?", not "are the upstreams up?", so a third-party outage or a spent quota
 * can't get the container killed and restarted in a loop. It does report which
 * keys are present so a misconfigured deploy is visible without a real
 * interview; only booleans, never the values.
 */
// Without this the handler has no dynamic inputs, so Next prerenders it at
// build time — freezing `uptimeSeconds` at 0 and reporting the build
// environment's keys rather than the running container's.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    config: {
      gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_PROJECT),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
}
