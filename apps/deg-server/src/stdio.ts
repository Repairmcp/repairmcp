#!/usr/bin/env node
/**
 * STDIO entry point for `repairmcp-deg`. Designed to be spawned by Claude Desktop
 * (or any MCP client that uses STDIO transport).
 *
 * IMPORTANT: stdout is the JSON-RPC channel. All logging must go to stderr or it
 * will corrupt the protocol stream. Use console.error / process.stderr.write only.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RepairMCPServer } from '@repairmcp/core';
import { DEGAdapter, registerDegTools } from '@repairmcp/deg';

const __dirname = dirname(fileURLToPath(import.meta.url));
// When built: this file lives at apps/deg-server/dist/stdio.js, so data/ is at ../data/.
// When run from src via bun: src/stdio.ts, data/ is also at ../data/. Either way works.
const dataPath = join(__dirname, '..', 'data', 'sample-inquiries.json');

async function main(): Promise<void> {
  const adapter = DEGAdapter.fromJsonFile(dataPath);
  process.stderr.write(
    `repairmcp-deg: loaded ${adapter.size()} inquiries from ${dataPath}\n`,
  );

  const server = new RepairMCPServer(adapter, {
    name: 'repairmcp-deg',
    version: '0.1.0',
  });
  // Register all four DEG tools with shop-floor descriptions. search/get/list_recent
  // delegate to core builders with description overrides; find_supporting carries
  // its own scoring (bigram + unigram + IP/vehicle/operation/recency).
  registerDegTools(server, adapter);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('repairmcp-deg: connected (stdio transport, ready for requests)\n');
}

main().catch((err) => {
  process.stderr.write(`repairmcp-deg: fatal: ${(err as Error).message}\n`);
  if (err instanceof Error && err.stack) process.stderr.write(err.stack + '\n');
  process.exit(1);
});
