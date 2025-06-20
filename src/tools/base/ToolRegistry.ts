import { BaseTool } from './BaseTool.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Registry for managing and organizing MCP tools
 * Provides tool discovery, registration, and execution capabilities
 */
export class ToolRegistry {
  private tools = new Map<string, BaseTool>();
  private categories = new Map<string, Set<string>>();
  private logger = createModuleLogger('ToolRegistry');

  /**
   * Register a tool with the registry
   */
  async registerTool(tool: BaseTool): Promise<void> {
    const name = tool.metadata.name;
    
    if (this.tools.has(name)) {
      this.logger.warn('Tool already registered, overwriting', { toolName: name });
    }

    this.tools.set(name, tool);
    
    // Add to category if specified
    if (tool.metadata.category) {
      if (!this.categories.has(tool.metadata.category)) {
        this.categories.set(tool.metadata.category, new Set());
      }
      this.categories.get(tool.metadata.category)!.add(name);
    }

    this.logger.info('Tool registered successfully', {
      toolName: name,
      category: tool.metadata.category,
      version: tool.metadata.version
    });
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): BaseTool[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      return [];
    }

    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter((tool): tool is BaseTool => tool !== undefined);
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool by name
   */
  async executeTool<T = any>(name: string, input: any): Promise<ToolResult<T>> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        error: {
          message: `Tool '${name}' not found`,
          code: 'TOOL_NOT_FOUND'
        },
        metadata: {
          toolName: name,
          executionTime: new Date().toISOString()
        }
      };
    }

    return tool.execute(input);
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const toolsByCategory = new Map<string, number>();
    
    for (const [category, tools] of this.categories) {
      toolsByCategory.set(category, tools.size);
    }

    return {
      totalTools: this.tools.size,
      totalCategories: this.categories.size,
      toolsByCategory: Object.fromEntries(toolsByCategory),
      tools: Array.from(this.tools.keys())
    };
  }

  /**
   * Get tool metadata for documentation
   */
  getToolsMetadata() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.metadata.name,
      description: tool.metadata.description,
      category: tool.metadata.category,
      subcategory: tool.metadata.subcategory,
      functionType: tool.metadata.functionType,
      version: tool.metadata.version,
      stability: tool.metadata.stability,
      tags: tool.metadata.tags,
      examples: tool.metadata.examples
    }));
  }

  /**
   * Search tools by name or description
   */
  searchTools(query: string): BaseTool[] {
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.tools.values()).filter(tool => 
      tool.metadata.name.toLowerCase().includes(lowerQuery) ||
      tool.metadata.description.toLowerCase().includes(lowerQuery) ||
      (tool.metadata.tags && tool.metadata.tags.some(tag => 
        tag.toLowerCase().includes(lowerQuery)
      ))
    );
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.logger.info('Tool registry cleared');
  }

  /**
   * Unregister a specific tool
   */
  unregisterTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }

    this.tools.delete(name);
    
    // Remove from category
    if (tool.metadata.category) {
      const categoryTools = this.categories.get(tool.metadata.category);
      if (categoryTools) {
        categoryTools.delete(name);
        if (categoryTools.size === 0) {
          this.categories.delete(tool.metadata.category);
        }
      }
    }

    this.logger.info('Tool unregistered', { toolName: name });
    return true;
  }
}
