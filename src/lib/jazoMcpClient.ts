/**
 * MCP client side of the story generator.
 *
 * Connects to our own `/api/mcp` over streamable HTTP, discovers the JAZO tools
 * at runtime, and translates them into Anthropic tool definitions. Tools are
 * discovered rather than hardcoded, so adding a tool to
 * `src/lib/jazoMcpServer.ts` is enough to make it available to Claude.
 */

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type Anthropic from '@anthropic-ai/sdk';

export interface JazoMcpSession {
  /** Tool definitions to hand to the Messages API. */
  tools: Anthropic.Tool[];
  /** Run one tool call and return its result rendered as text. */
  callTool(name: string, input: unknown): Promise<{ text: string; isError: boolean }>;
  close(): Promise<void>;
}

/**
 * Resolve the MCP endpoint. `JAZO_MCP_URL` wins so the server can be run out of
 * process; otherwise we talk to the `/api/mcp` route in this same app, derived
 * from the incoming request's own origin.
 */
export function resolveMcpUrl(requestUrl: string): URL {
  const override = process.env.JAZO_MCP_URL;
  return override ? new URL(override) : new URL('/api/mcp', requestUrl);
}

export async function connectJazoMcp(mcpUrl: URL): Promise<JazoMcpSession> {
  const client = new Client({ name: 'jazo-story-generator', version: '0.2.0' });
  const transport = new StreamableHTTPClientTransport(mcpUrl);

  await client.connect(transport);

  const { tools: mcpTools } = await client.listTools();

  const tools: Anthropic.Tool[] = mcpTools.map((tool) => {
    // MCP emits a JSON Schema dialect marker the Messages API has no use for.
    const inputSchema = { ...(tool.inputSchema as Record<string, unknown>) };
    delete inputSchema.$schema;

    return {
      name: tool.name,
      description: tool.description ?? '',
      input_schema: inputSchema as Anthropic.Tool['input_schema'],
    };
  });

  return {
    tools,

    async callTool(name, input) {
      const result = await client.callTool({
        name,
        arguments: (input ?? {}) as Record<string, unknown>,
      });

      const text = (result.content ?? [])
        .map((block) =>
          block.type === 'text' ? block.text : `[unsupported content block: ${block.type}]`
        )
        .join('\n');

      return { text, isError: result.isError === true };
    },

    async close() {
      await client.close();
    },
  };
}
