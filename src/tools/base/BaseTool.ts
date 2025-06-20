import { z } from 'zod';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { validateSchema, ValidationError } from '@/utils/validation.js';
import { handleToolErrors } from '@/utils/errors.js';
import { createModuleLogger } from '@/utils/logger.js';

// Base interface for all MCP tools
export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  examples?: Array<{
    name: string;
    description: string;
    arguments: any;
  }>;
}

// Base class for all MCP tools
export abstract class BaseTool {
  protected logger = createModuleLogger(this.constructor.name);

  abstract readonly metadata: ToolMetadata;

  // Get the MCP tool definition
  getTool(): Tool {
    return {
      name: this.metadata.name,
      description: this.metadata.description,
      inputSchema: this.zodSchemaToJsonSchema(this.metadata.inputSchema),
    };
  }

  // Execute the tool with validated parameters
  @handleToolErrors
  async execute(args: unknown): Promise<any> {
    this.logger.info(`Executing tool: ${this.metadata.name}`, { args });

    // Validate input parameters
    const validatedArgs = this.validateInput(args);

    // Execute the tool logic
    const result = await this.executeImpl(validatedArgs);

    this.logger.debug(`Tool execution completed: ${this.metadata.name}`, { result });
    
    return result;
  }

  // Abstract method to be implemented by concrete tools
  protected abstract executeImpl(args: any): Promise<any>;

  // Validate input against the schema
  private validateInput(args: unknown): any {
    try {
      return validateSchema(this.metadata.inputSchema, args);
    } catch (error) {
      this.logger.error(`Input validation failed for ${this.metadata.name}`, { args, error });
      throw error;
    }
  }

  // Convert Zod schema to JSON Schema for MCP
  private zodSchemaToJsonSchema(schema: z.ZodSchema): any {
    // This is a simplified converter - in production you might want to use a library
    return this.convertZodToJsonSchema(schema);
  }

  private convertZodToJsonSchema(schema: z.ZodSchema): any {
    const def = schema._def;

    switch (def.typeName) {
      case 'ZodString':
        return { type: 'string' };
      
      case 'ZodNumber':
        return { type: 'number' };
      
      case 'ZodBoolean':
        return { type: 'boolean' };
      
      case 'ZodArray':
        return {
          type: 'array',
          items: this.convertZodToJsonSchema(def.type),
        };
      
      case 'ZodObject':
        const properties: any = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(def.shape())) {
          properties[key] = this.convertZodToJsonSchema(value as z.ZodSchema);
          
          // Check if field is optional
          if (!(value as any)._def.typeName === 'ZodOptional') {
            required.push(key);
          }
        }

        return {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
          additionalProperties: false,
        };
      
      case 'ZodOptional':
        return this.convertZodToJsonSchema(def.innerType);
      
      case 'ZodEnum':
        return {
          type: 'string',
          enum: def.values,
        };
      
      case 'ZodLiteral':
        return {
          type: typeof def.value,
          const: def.value,
        };
      
      case 'ZodUnion':
        return {
          oneOf: def.options.map((option: z.ZodSchema) => 
            this.convertZodToJsonSchema(option)
          ),
        };
      
      default:
        // Fallback for unsupported types
        return { type: 'string' };
    }
  }

  // Helper method to create success response
  protected createSuccessResponse(data: any, message?: string) {
    return {
      success: true,
      data,
      message: message || 'Operation completed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  // Helper method to create paginated response
  protected createPaginatedResponse(
    items: any[],
    total: number,
    page: number,
    perPage: number
  ) {
    return {
      success: true,
      data: {
        items,
        pagination: {
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage),
          hasNext: page * perPage < total,
          hasPrev: page > 1,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Helper method to format response with metadata
  protected formatResponse(data: any, metadata?: any) {
    return {
      success: true,
      data,
      metadata: {
        tool: this.metadata.name,
        executedAt: new Date().toISOString(),
        ...metadata,
      },
    };
  }
}