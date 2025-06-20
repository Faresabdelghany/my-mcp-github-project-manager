import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './BaseTool.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ValidationError } from '@/utils/errors.js';

export interface ToolCategory {
  name: string;
  description: string;
  tools: string[];
}

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();
  private categories = new Map<string, ToolCategory>();
  private logger = createModuleLogger('ToolRegistry');

  // Register a single tool
  register(tool: BaseTool): void {
    const name = tool.metadata.name;
    
    if (this.tools.has(name)) {
      throw new ValidationError(`Tool '${name}' is already registered`);
    }

    this.tools.set(name, tool);
    this.logger.info(`Registered tool: ${name}`);
  }

  // Register multiple tools
  registerTools(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  // Register a category of tools
  registerCategory(category: ToolCategory): void {
    if (this.categories.has(category.name)) {
      throw new ValidationError(`Category '${category.name}' is already registered`);
    }

    this.categories.set(category.name, category);
    this.logger.info(`Registered category: ${category.name}`, {
      toolCount: category.tools.length,
    });
  }

  // Get a specific tool
  getTool(name: string): BaseTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ValidationError(`Tool '${name}' not found`);
    }
    return tool;
  }

  // Get all registered tools
  getTools(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  // Get tool names
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  // Get MCP tool definitions
  getMcpTools(): Tool[] {
    return this.getTools().map(tool => tool.getTool());
  }

  // Get tools by category
  getToolsByCategory(categoryName: string): BaseTool[] {
    const category = this.categories.get(categoryName);
    if (!category) {
      return [];
    }

    return category.tools
      .map(toolName => this.tools.get(toolName))
      .filter((tool): tool is BaseTool => tool !== undefined);
  }

  // Get all categories
  getCategories(): ToolCategory[] {
    return Array.from(this.categories.values());
  }

  // Check if tool exists
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  // Execute a tool by name
  async executeTool(name: string, args: unknown): Promise<any> {
    const tool = this.getTool(name);
    
    this.logger.info(`Executing tool: ${name}`, { args });
    const startTime = Date.now();

    try {
      const result = await tool.execute(args);
      const duration = Date.now() - startTime;
      
      this.logger.info(`Tool execution completed: ${name}`, {
        duration: `${duration}ms`,
        success: true,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(`Tool execution failed: ${name}`, {
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  // Get registry statistics
  getStats() {
    const toolsByCategory = new Map<string, number>();
    
    for (const category of this.categories.values()) {
      toolsByCategory.set(category.name, category.tools.length);
    }

    return {
      totalTools: this.tools.size,
      totalCategories: this.categories.size,
      toolsByCategory: Object.fromEntries(toolsByCategory),
      registeredTools: this.getToolNames(),
    };
  }

  // Validate tool registration (useful for testing)
  validateRegistration(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for duplicate tool names
    const toolNames = new Set<string>();
    for (const tool of this.tools.values()) {
      if (toolNames.has(tool.metadata.name)) {
        issues.push(`Duplicate tool name: ${tool.metadata.name}`);
      }
      toolNames.add(tool.metadata.name);
    }

    // Check category references
    for (const category of this.categories.values()) {
      for (const toolName of category.tools) {
        if (!this.tools.has(toolName)) {
          issues.push(`Category '${category.name}' references unknown tool: ${toolName}`);
        }
      }
    }

    // Check for orphaned tools (not in any category)
    const categorizedTools = new Set<string>();
    for (const category of this.categories.values()) {
      for (const toolName of category.tools) {
        categorizedTools.add(toolName);
      }
    }

    for (const toolName of this.tools.keys()) {
      if (!categorizedTools.has(toolName)) {
        issues.push(`Tool '${toolName}' is not assigned to any category`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // Clear all registrations (useful for testing)
  clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.logger.info('Tool registry cleared');
  }

  // Get detailed tool information for documentation
  getToolDocumentation() {
    return {
      categories: Array.from(this.categories.values()).map(category => ({
        name: category.name,
        description: category.description,
        tools: category.tools.map(toolName => {
          const tool = this.tools.get(toolName);
          return tool ? {
            name: tool.metadata.name,
            description: tool.metadata.description,
            inputSchema: tool.metadata.inputSchema,
            examples: tool.metadata.examples || [],
          } : null;
        }).filter(Boolean),
      })),
      stats: this.getStats(),
    };
  }
}