/**
 * Common types for MCP tool system
 */

/**
 * Result of tool execution
 */
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: ToolError;
  message?: string;
  metadata?: ToolMetadata;
}

/**
 * Tool execution error
 */
export interface ToolError {
  message: string;
  code: string;
  details?: any;
}

/**
 * Tool execution metadata
 */
export interface ToolMetadata {
  toolName: string;
  executionTime: string;
  version?: string;
  [key: string]: any;
}

/**
 * Context for tool execution
 */
export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  environment?: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}

/**
 * Tool capability definition
 */
export interface ToolCapability {
  name: string;
  description: string;
  required: boolean;
  version?: string;
}

/**
 * Tool configuration
 */
export interface ToolConfig {
  enabled: boolean;
  timeout?: number;
  retries?: number;
  rateLimit?: {
    requests: number;
    window: number; // in milliseconds
  };
  permissions?: string[];
  metadata?: Record<string, any>;
}

/**
 * Tool registry entry
 */
export interface ToolRegistryEntry {
  name: string;
  description: string;
  category?: string;
  subcategory?: string;
  version: string;
  stability: 'stable' | 'beta' | 'alpha' | 'experimental';
  capabilities: ToolCapability[];
  config: ToolConfig;
  schema: any; // JSON Schema
  examples?: any[];
}

/**
 * Tool execution statistics
 */
export interface ToolExecutionStats {
  toolName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
  errorRate: number;
}

/**
 * Tool search filters
 */
export interface ToolSearchFilters {
  category?: string;
  subcategory?: string;
  functionType?: 'create' | 'read' | 'update' | 'delete' | 'execute';
  stability?: 'stable' | 'beta' | 'alpha' | 'experimental';
  tags?: string[];
  enabled?: boolean;
}

/**
 * Tool documentation
 */
export interface ToolDocumentation {
  name: string;
  description: string;
  usage: string;
  parameters: ParameterDocumentation[];
  returns: ReturnDocumentation;
  examples: ExampleDocumentation[];
  notes?: string[];
  seeAlso?: string[];
}

export interface ParameterDocumentation {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: any;
  examples?: any[];
}

export interface ReturnDocumentation {
  type: string;
  description: string;
  properties?: ParameterDocumentation[];
}

export interface ExampleDocumentation {
  title: string;
  description: string;
  input: any;
  output: any;
  notes?: string;
}
