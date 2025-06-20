import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Custom error types
export class GitHubAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'GitHubAPIError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ResourceNotFoundError extends Error {
  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} with ID ${resourceId} not found`);
    this.name = 'ResourceNotFoundError';
  }
}

export class CacheError extends Error {
  constructor(message: string, public operation?: string) {
    super(message);
    this.name = 'CacheError';
  }
}

export class SyncError extends Error {
  constructor(message: string, public resourceType?: string) {
    super(message);
    this.name = 'SyncError';
  }
}

// Error mapping to MCP error codes
export function mapErrorToMcpError(error: Error): McpError {
  if (error instanceof ValidationError) {
    return new McpError(
      ErrorCode.InvalidParams,
      `Validation failed: ${error.message}`,
      error.details
    );
  }

  if (error instanceof ResourceNotFoundError) {
    return new McpError(
      ErrorCode.InvalidParams,
      error.message
    );
  }

  if (error instanceof GitHubAPIError) {
    if (error.statusCode === 401) {
      return new McpError(
        ErrorCode.InvalidParams,
        'GitHub authentication failed. Please check your token.'
      );
    }
    
    if (error.statusCode === 403) {
      return new McpError(
        ErrorCode.InvalidParams,
        'GitHub API rate limit exceeded or insufficient permissions.'
      );
    }

    if (error.statusCode === 404) {
      return new McpError(
        ErrorCode.InvalidParams,
        'GitHub resource not found. Please check the repository and resource IDs.'
      );
    }

    return new McpError(
      ErrorCode.InternalError,
      `GitHub API error: ${error.message}`
    );
  }

  if (error instanceof CacheError || error instanceof SyncError) {
    return new McpError(
      ErrorCode.InternalError,
      error.message
    );
  }

  // Generic error handling
  return new McpError(
    ErrorCode.InternalError,
    `Internal server error: ${error.message}`
  );
}

// Error handler decorator for tools
export function handleToolErrors(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    try {
      return await method.apply(this, args);
    } catch (error) {
      const mcpError = mapErrorToMcpError(error as Error);
      throw mcpError;
    }
  };

  return descriptor;
}

// Utility function to create structured error responses
export function createErrorResponse(error: Error, context?: string) {
  return {
    success: false,
    error: {
      name: error.name,
      message: error.message,
      context: context || 'Unknown',
      timestamp: new Date().toISOString(),
    },
  };
}