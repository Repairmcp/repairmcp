import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { SourceAdapter } from '../adapter/source-adapter.js';
import type { BaseItem } from '../adapter/types.js';
import {
  buildFindSupportingTool,
  buildGetByIdTool,
  buildListRecentTool,
  buildSearchTool,
  type ToolRegistrar,
} from './tool-builder.js';

export interface RepairMCPServerOpts {
  /** Server name advertised over MCP (e.g. "repairmcp-deg"). */
  name: string;
  /** Server version, e.g. package.json version. */
  version: string;
}

/**
 * Thin wrapper around the MCP SDK `McpServer` that knows how to register the
 * four standard tools from any `SourceAdapter`. Verticals can also attach
 * custom tools via `registerCustomTool`.
 */
export class RepairMCPServer<TItem extends BaseItem> {
  private readonly mcpServer: McpServer;

  constructor(
    private readonly adapter: SourceAdapter<TItem>,
    opts: RepairMCPServerOpts,
  ) {
    this.mcpServer = new McpServer(
      { name: opts.name, version: opts.version },
      { capabilities: { tools: {} } },
    );
  }

  /**
   * Register the four standard tools auto-generated from the adapter.
   * Tool names are prefixed with the adapter's `sourceId`.
   */
  registerStandardTools(): this {
    const registrars: ToolRegistrar[] = [
      buildSearchTool(this.adapter),
      buildGetByIdTool(this.adapter),
      buildListRecentTool(this.adapter),
      buildFindSupportingTool(this.adapter),
    ];
    for (const register of registrars) register(this.mcpServer);
    return this;
  }

  /**
   * Register a vertical-specific custom tool (e.g. deg_get_estimating_tip).
   * The registrar is responsible for choosing a unique name; collisions throw.
   */
  registerCustomTool(register: ToolRegistrar): this {
    register(this.mcpServer);
    return this;
  }

  /** Bind to a transport (STDIO, Streamable HTTP, ...) and start listening. */
  async connect(transport: Transport): Promise<void> {
    await this.mcpServer.connect(transport);
  }

  async close(): Promise<void> {
    await this.mcpServer.close();
  }

  /** Escape hatch for advanced features (notifications, custom request handlers). */
  getServer(): McpServer {
    return this.mcpServer;
  }
}
