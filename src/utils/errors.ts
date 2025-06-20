/**
 * Custom error classes for the GitHub Project Manager MCP
 */

/**
 * Base error class for all application errors
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date();

    // Maintain proper stack trace for where the error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }
}

/**
 * GitHub API specific errors
 */
export class GitHubAPIError extends AppError {
  public readonly apiResponse?: any;
  public readonly rateLimit?: {
    limit: number;
    remaining: number;
    resetTime: Date;
  };

  constructor(
    message: string,
    apiResponse?: any,
    rateLimit?: { limit: number; remaining: number; resetTime: Date }
  ) {
    const statusCode = apiResponse?.status || 500;
    const code = `GITHUB_API_ERROR_${statusCode}`;
    
    super(message, code, statusCode, true, {
      apiResponse: apiResponse ? {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        data: apiResponse.data
      } : undefined
    });
    
    this.apiResponse = apiResponse;
    this.rateLimit = rateLimit;
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', 500, false, details);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  public readonly validationErrors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;

  constructor(message: string, validationErrors: Array<{ field: string; message: string; value?: any }>) {
    super(message, 'VALIDATION_ERROR', 400, true, { validationErrors });
    this.validationErrors = validationErrors;
  }
}

/**
 * Tool execution errors
 */
export class ToolExecutionError extends AppError {
  public readonly toolName: string;
  public readonly executionContext?: any;

  constructor(message: string, toolName: string, executionContext?: any, details?: any) {
    super(message, 'TOOL_EXECUTION_ERROR', 500, true, { 
      toolName, 
      executionContext, 
      ...details 
    });
    this.toolName = toolName;
    this.executionContext = executionContext;
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;
  public readonly limit: number;
  public readonly remaining: number;

  constructor(
    message: string, 
    retryAfter: number, 
    limit: number, 
    remaining: number
  ) {
    super(
      message, 
      'RATE_LIMIT_EXCEEDED', 
      429, 
      true, 
      { retryAfter, limit, remaining }
    );
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, true, details);
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends AppError {
  public readonly requiredPermissions?: string[];
  public readonly userPermissions?: string[];

  constructor(
    message: string, 
    requiredPermissions?: string[], 
    userPermissions?: string[]
  ) {
    super(
      message, 
      'AUTHORIZATION_ERROR', 
      403, 
      true, 
      { requiredPermissions, userPermissions }
    );
    this.requiredPermissions = requiredPermissions;
    this.userPermissions = userPermissions;
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends AppError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(
      `${resourceType} with ID '${resourceId}' not found`,
      'RESOURCE_NOT_FOUND',
      404,
      true,
      { resourceType, resourceId }
    );
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends AppError {
  public readonly timeout: number;
  public readonly operation: string;

  constructor(operation: string, timeout: number) {
    super(
      `Operation '${operation}' timed out after ${timeout}ms`,
      'OPERATION_TIMEOUT',
      408,
      true,
      { operation, timeout }
    );
    this.operation = operation;
    this.timeout = timeout;
  }
}

/**
 * Error factory functions
 */
export const ErrorFactory = {
  /**
   * Create a GitHub API error from an axios error
   */
  fromGitHubApiError(error: any): GitHubAPIError {
    const message = error.response?.data?.message || error.message || 'GitHub API error';
    const rateLimit = error.response?.headers ? {
      limit: parseInt(error.response.headers['x-ratelimit-limit']) || 0,
      remaining: parseInt(error.response.headers['x-ratelimit-remaining']) || 0,
      resetTime: new Date(parseInt(error.response.headers['x-ratelimit-reset']) * 1000)
    } : undefined;
    
    return new GitHubAPIError(message, error.response, rateLimit);
  },

  /**
   * Create a validation error from Zod error
   */
  fromZodError(error: any): ValidationError {
    const validationErrors = error.errors?.map((err: any) => ({
      field: err.path.join('.'),
      message: err.message,
      value: err.received
    })) || [];
    
    return new ValidationError('Validation failed', validationErrors);
  },

  /**
   * Create an error from unknown error type
   */
  fromUnknown(error: unknown, context?: string): AppError {
    if (error instanceof AppError) {
      return error;
    }
    
    if (error instanceof Error) {
      return new AppError(
        error.message,
        'WRAPPED_ERROR',
        500,
        true,
        { originalError: error.name, context }
      );
    }
    
    return new AppError(
      'An unknown error occurred',
      'UNKNOWN_ERROR',
      500,
      false,
      { originalError: String(error), context }
    );
  }
};

/**
 * Error handler utility
 */
export class ErrorHandler {
  /**
   * Handle and log errors appropriately
   */
  static handle(error: Error, context?: string): never {
    const appError = error instanceof AppError ? error : ErrorFactory.fromUnknown(error, context);
    
    // Log the error
    console.error('Error occurred:', {
      message: appError.message,
      code: appError.code,
      statusCode: appError.statusCode,
      isOperational: appError.isOperational,
      details: appError.details,
      stack: appError.stack,
      context
    });
    
    throw appError;
  }

  /**
   * Check if error is operational (expected) or programming error
   */
  static isOperationalError(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }

  /**
   * Extract user-friendly error message
   */
  static getUserFriendlyMessage(error: Error): string {
    if (error instanceof ValidationError) {
      return `Validation failed: ${error.validationErrors.map(e => e.message).join(', ')}`;
    }
    
    if (error instanceof GitHubAPIError) {
      return `GitHub API error: ${error.message}`;
    }
    
    if (error instanceof RateLimitError) {
      return `Rate limit exceeded. Please try again in ${error.retryAfter} seconds.`;
    }
    
    if (error instanceof AppError && error.isOperational) {
      return error.message;
    }
    
    return 'An unexpected error occurred. Please try again later.';
  }
}
