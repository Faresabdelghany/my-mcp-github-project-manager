import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from '@/tools/base/ToolRegistry.js';
import { config } from '@/config/index.js';
import { createModuleLogger } from '@/utils/logger.js';
import { mapErrorToMcpError } from '@/utils/errors.js';

export class MCPGitHubProjectManager {
  private server: Server;
  private toolRegistry: ToolRegistry;
  private logger = createModuleLogger('MCPServer');
  private isInitialized = false;

  constructor() {
    this.toolRegistry = new ToolRegistry();
    this.server = new Server(
      {
        name: 'mcp-github-project-manager',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  // Initialize the server with tools
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Server already initialized');
      return;
    }

    try {
      this.logger.info('Initializing MCP GitHub Project Manager...');

      // Register tools (we'll add these in the next phase)
      await this.registerTools();

      // Validate tool registration
      const validation = this.toolRegistry.validateRegistration();
      if (!validation.valid) {
        this.logger.warn('Tool registration validation issues:', {
          issues: validation.issues,
        });
      }

      // Log registration summary
      const stats = this.toolRegistry.getStats();
      this.logger.info('Tool registration completed', stats);

      this.isInitialized = true;
      this.logger.info('MCP GitHub Project Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize server', { error });
      throw error;
    }
  }

  // Start the server
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.logger.info('MCP Server started successfully', {
        transport: 'stdio',
        toolCount: this.toolRegistry.getStats().totalTools,
      });

      // Log server capabilities
      this.logServerInfo();
    } catch (error) {
      this.logger.error('Failed to start server', { error });
      throw error;
    }
  }

  // Stop the server
  async stop(): Promise<void> {
    try {
      await this.server.close();
      this.logger.info('MCP Server stopped');
    } catch (error) {
      this.logger.error('Error stopping server', { error });
      throw error;
    }
  }

  // Setup MCP protocol handlers
  private setupHandlers(): void {
    // Handle list_tools requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = this.toolRegistry.getMcpTools();
        this.logger.debug(`Returning ${tools.length} tools`);
        
        return {
          tools,
        };
      } catch (error) {
        this.logger.error('Error listing tools', { error });
        throw mapErrorToMcpError(error as Error);
      }
    });

    // Handle call_tool requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        this.logger.info(`Tool called: ${name}`, { args });

        if (!this.toolRegistry.hasTool(name)) {
          throw new Error(`Tool '${name}' not found`);
        }

        const result = await this.toolRegistry.executeTool(name, args);
        
        return {
          content: [
            {
              type: 'text',
              text: this.formatToolResponse(result),
            },
          ],
        };
      } catch (error) {
        this.logger.error(`Tool execution failed: ${name}`, { error, args });
        throw mapErrorToMcpError(error as Error);
      }
    });
  }

  // Register all available tools
  private async registerTools(): Promise<void> {
    this.logger.info('Registering tools...');

    // We'll implement this in the next phases:
    // await this.registerGitHubTools();
    // await this.registerTemplateTools();
    // await this.registerTraceabilityTools();

    this.logger.info('Tool registration placeholder - tools will be added in next phases');
  }

  // Format tool response for MCP
  private formatToolResponse(result: any): string {
    if (typeof result === 'string') {
      return result;
    }

    // Format structured responses
    if (result && typeof result === 'object') {
      if (result.success !== undefined) {
        // Standard response format
        if (result.success) {
          let output = `✅ **Success**\n\n`;
          
          if (result.message) {
            output += `${result.message}\n\n`;
          }

          if (result.data) {
            output += `**Data:**\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\`\n\n`;
          }

          if (result.metadata) {
            output += `**Metadata:**\n\`\`\`json\n${JSON.stringify(result.metadata, null, 2)}\n\`\`\``;
          }

          return output;
        } else {
          return `❌ **Error:** ${result.error?.message || 'Unknown error'}`;
        }
      }

      // Generic object formatting
      return `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
    }

    return String(result);
  }

  // Log server information
  private logServerInfo(): void {
    const stats = this.toolRegistry.getStats();
    
    this.logger.info('Server Information:', {
      name: 'mcp-github-project-manager',
      version: '1.0.0',
      environment: config.server.nodeEnv,
      logLevel: config.server.logLevel,
      features: {
        traceability: config.features.traceability,
        webhooks: config.features.webhooks,
        persistence: config.features.persistence,
      },
      tools: stats,
    });

    // Log available categories
    const categories = this.toolRegistry.getCategories();
    if (categories.length > 0) {
      this.logger.info('Available tool categories:', {
        categories: categories.map(cat => ({
          name: cat.name,
          description: cat.description,
          toolCount: cat.tools.length,
        })),
      });
    }
  }

  // Get server status (useful for health checks)
  getStatus() {
    return {
      initialized: this.isInitialized,
      toolCount: this.toolRegistry.getStats().totalTools,
      categories: this.toolRegistry.getStats().totalCategories,
      config: {
        nodeEnv: config.server.nodeEnv,
        logLevel: config.server.logLevel,
        features: config.features,
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  }

  // Get tool registry for internal use
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
}