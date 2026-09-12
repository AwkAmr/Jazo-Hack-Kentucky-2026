#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio.js';
import { createJazoMcpServer } from './lib/jazoMcpServer.js';

async function main() {
  const server = createJazoMcpServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  console.error('[JAZO MCP] Server started on stdio');
}

main().catch((error) => {
  console.error('[JAZO MCP] Fatal error:', error);
  process.exit(1);
});
