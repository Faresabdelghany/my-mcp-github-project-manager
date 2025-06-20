import { z } from 'zod';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult, ToolExecutionContext } from '@/types/tools.js';

/**
 * Metadata for tool registration and documentation
 */
export interface ToolMetadata {
  name: string;
  description: string;
  category?: string;
  subcategory?: string;
  functionType?: 'create' | 'read' | 'update' | 'delete' | 'execute';
  version?: string;
  stability?: 'stable' | 'beta' | 'alpha' | 'experimental';
  tags?: string[];
  examples?: ToolExample[];
}

export interface ToolExample {
  name: string;
  description: string;
  arguments: Record<string, any>;
  expectedResult?: any;
}

/**
 * Base abstract class for all MCP tools
 * Provides common functionality for validation, execution, and error handling
 */
export abstract class BaseTool<TInput = any, TOutput = any> {
  public abstract readonly metadata: ToolMetadata;
  public abstract readonly schema: z.ZodSchema<TInput>;
  
  protected readonly logger = createModuleLogger(`Tool:${this.constructor.name}`);
  private executionCount = 0;
  private lastExecutionTime?: Date;

  /**
   * Execute the tool with validated input
   */
  async execute(input: TInput, context?: ToolExecutionContext): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    this.executionCount++;
    this.lastExecutionTime = new Date();

    this.logger.info('Tool execution started', {
      toolName: this.metadata.name,
      executionCount: this.executionCount,
      input: this.sanitizeInputForLogging(input)
    });

    try {
      // Validate input against schema
      const validatedInput = await this.validateInput(input);
      
      // Execute the tool implementation
      const result = await this.executeImpl(validatedInput, context);
      
      const duration = Date.now() - startTime;
      this.logger.info('Tool execution completed', {
        toolName: this.metadata.name,
        executionCount: this.executionCount,
        duration,
        success: result.success
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Tool execution failed', {
        toolName: this.metadata.name,
        executionCount: this.executionCount,
        duration,
        error: error instanceof Error ? error.message : String(error)
      });

      return this.createErrorResponse(
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'TOOL_EXECUTION_ERROR',
        { input, error: String(error) }
      );
    }
  }

  /**
   * Abstract method to be implemented by concrete tools
   */
  protected abstract executeImpl(input: TInput, context?: ToolExecutionContext): Promise<ToolResult<TOutput>>;

  /**
   * Validate input against the tool's schema
   */
  protected async validateInput(input: TInput): Promise<TInput> {
    try {
      return this.schema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        throw new Error(`Input validation failed: ${errorMessages}`);
      }
      throw error;
    }
  }

  /**
   * Create a successful tool result
   */
  protected createSuccessResponse(data: TOutput, message?: string): ToolResult<TOutput> {
    return {
      success: true,
      data,
      message: message || 'Operation completed successfully',
      metadata: {
        toolName: this.metadata.name,
        executionTime: new Date().toISOString(),
        version: this.metadata.version || '1.0.0'
      }
    };
  }

  /**
   * Create an error tool result
   */
  protected createErrorResponse(
    message: string, 
    errorCode?: string, 
    details?: any
  ): ToolResult<TOutput> {
    return {
      success: false,
      error: {
        message,
        code: errorCode || 'UNKNOWN_ERROR',
        details
      },
      metadata: {
        toolName: this.metadata.name,
        executionTime: new Date().toISOString(),
        version: this.metadata.version || '1.0.0'
      }
    };
  }

  /**
   * Sanitize input for logging (remove sensitive data)
   */
  protected sanitizeInputForLogging(input: TInput): any {
    if (typeof input !== 'object' || input === null) {
      return input;
    }

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'auth'];
    const sanitized = { ...input } as any;

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Get tool execution statistics
   */
  getExecutionStats() {
    return {
      executionCount: this.executionCount,
      lastExecutionTime: this.lastExecutionTime,
      metadata: this.metadata
    };
  }

  /**
   * Get tool schema as JSON Schema for documentation
   */
  getSchemaDefinition() {
    return {
      name: this.metadata.name,
      description: this.metadata.description,
      inputSchema: this.schema,
      examples: this.metadata.examples || []
    };
  }
}
