import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from '@/tools/base/ToolRegistry.js';
import { createModuleLogger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { validateSchema } from '@/utils/validation.js';

/**
 * MCP Server for GitHub Project Management Tools
 * Provides comprehensive project, issue, and milestone management capabilities
 */
export class MCPServer {
  private server: Server;
  private toolRegistry: ToolRegistry;
  private logger = createModuleLogger('MCPServer');

  constructor() {
    this.server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.toolRegistry = new ToolRegistry();
    this.setupHandlers();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.info('Listing available tools');
      
      const tools = this.toolRegistry.getAllTools();
      const toolDescriptions = tools.map(tool => ({
        name: tool.metadata.name,
        description: tool.metadata.description,
        inputSchema: tool.schema
      }));

      this.logger.info('Listed tools successfully', { toolCount: tools.length });
      return { tools: toolDescriptions };
    });

    // Execute tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      this.logger.info('Executing tool', { toolName: name, args });

      try {
        // Get the tool from registry
        const tool = this.toolRegistry.getTool(name);
        if (!tool) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool '${name}' not found`
          );
        }

        // Validate arguments against tool schema
        const validatedArgs = await validateSchema(tool.schema, args || {});
        
        // Execute the tool
        const result = await tool.execute(validatedArgs);
        
        this.logger.info('Tool executed successfully', { 
          toolName: name, 
          success: result.success 
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };

      } catch (error) {
        this.logger.error('Tool execution failed', { 
          toolName: name, 
          error: error instanceof Error ? error.message : String(error),
          args 
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * Register all available tools
   */
  private async registerTools(): Promise<void> {
    this.logger.info('Registering tools...');

    // Import and register GitHub tools
    const { registerGitHubTools } = await import('@/tools/github/index.js');
    await registerGitHubTools(this.toolRegistry);

    // Import and register other tool categories as they become available
    // const { registerProjectManagementTools } = await import('@/tools/project/index.js');
    // await registerProjectManagementTools(this.toolRegistry);

    // const { registerAITools } = await import('@/tools/ai/index.js');
    // await registerAITools(this.toolRegistry);

    const toolCount = this.toolRegistry.getAllTools().length;
    this.logger.info('All tools registered successfully', { toolCount });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting MCP Server...', {
        name: config.server.name,
        version: config.server.version,
        environment: config.environment
      });

      // Register all tools
      await this.registerTools();

      // Start the server with stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info('MCP Server started successfully', {
        transport: 'stdio',
        toolCount: this.toolRegistry.getAllTools().length
      });

    } catch (error) {
      this.logger.error('Failed to start MCP Server', { error });
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping MCP Server...');
      await this.server.close();
      this.logger.info('MCP Server stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping MCP Server', { error });
      throw error;
    }
  }

  /**
   * Get server health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      serverName: config.server.name,
      serverVersion: config.server.version,
      toolCount: this.toolRegistry.getAllTools().length,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }
}

// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPServer();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  // Start the server
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default MCPServer;
