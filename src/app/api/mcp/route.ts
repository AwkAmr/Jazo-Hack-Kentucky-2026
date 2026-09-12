/**
 * Streamable-HTTP endpoint for the JAZO MCP server.
 *
 * `/api/generate-story` connects here as an MCP client, but so can anything
 * else that speaks MCP (Claude Desktop, `mcp` CLI, inspector) — point it at
 * http://localhost:3000/api/mcp.
 */

import { createMcpHandler } from '@modelcontextprotocol/server';

import { createJazoMcpServer } from '@/lib/jazoMcpServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = createMcpHandler(createJazoMcpServer, {
  onerror: (error) => console.error('[JAZO MCP]', error),
});

export function POST(request: Request) {
  return handler.fetch(request);
}

export function GET(request: Request) {
  return handler.fetch(request);
}

export function DELETE(request: Request) {
  return handler.fetch(request);
}
