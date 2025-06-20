import { z } from 'zod';
import { ValidationError } from './errors.js';

// Common validation schemas
export const GitHubIdSchema = z.string().min(1, 'ID cannot be empty');
export const GitHubNodeIdSchema = z.string().regex(/^[A-Za-z0-9_=-]+$/, 'Invalid GitHub node ID');

// Utility function to validate data against a schema
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorDetails = error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      throw new ValidationError(
        `Validation failed: ${errorDetails.map(e => `${e.path}: ${e.message}`).join(', ')}`,
        errorDetails
      );
    }
    throw error;
  }
}

// Validation decorator for method parameters
export function ValidateParams(schema: z.ZodSchema) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const [params] = args;
      const validatedParams = validateSchema(schema, params);
      return method.apply(this, [validatedParams, ...args.slice(1)]);
    };

    return descriptor;
  };
}

// GitHub-specific validators
export const GitHubTokenSchema = z.string()
  .min(1, 'GitHub token is required')
  .regex(/^gh[ps]_[A-Za-z0-9_]{36,255}$/, 'Invalid GitHub token format');

export const GitHubOwnerSchema = z.string()
  .min(1, 'GitHub owner is required')
  .max(39, 'GitHub owner name too long')
  .regex(/^[a-zA-Z0-9-]+$/, 'Invalid GitHub owner format');

export const GitHubRepoSchema = z.string()
  .min(1, 'Repository name is required')
  .max(100, 'Repository name too long')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format');

// Common field validators
export const TitleSchema = z.string()
  .min(1, 'Title is required')
  .max(255, 'Title too long');

export const DescriptionSchema = z.string()
  .max(65535, 'Description too long')
  .optional();

export const LabelSchema = z.string()
  .min(1, 'Label cannot be empty')
  .max(50, 'Label too long');

export const StateSchema = z.enum(['open', 'closed']);

export const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const ComplexitySchema = z.number()
  .min(1, 'Complexity must be at least 1')
  .max(10, 'Complexity cannot exceed 10');

// Date validation helpers
export const DateStringSchema = z.string()
  .datetime({ message: 'Invalid date format. Use ISO 8601 format.' });

export const OptionalDateStringSchema = DateStringSchema.optional();

// URL validation
export const UrlSchema = z.string()
  .url('Invalid URL format')
  .optional();

// Array validation helpers
export const NonEmptyStringArraySchema = z.array(z.string().min(1))
  .min(1, 'Array cannot be empty');

export const StringArraySchema = z.array(z.string());

// Pagination schemas
export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  perPage: z.number().min(1).max(100).default(30),
});

export const LimitSchema = z.object({
  limit: z.number().min(1).max(100).default(30),
});

// ID validation helpers
export function validateGitHubId(id: string, resourceType: string): string {
  try {
    return GitHubIdSchema.parse(id);
  } catch {
    throw new ValidationError(`Invalid ${resourceType} ID: ${id}`);
  }
}

export function validateGitHubNodeId(nodeId: string, resourceType: string): string {
  try {
    return GitHubNodeIdSchema.parse(nodeId);
  } catch {
    throw new ValidationError(`Invalid ${resourceType} node ID: ${nodeId}`);
  }
}

// Utility to sanitize user input
export function sanitizeString(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

// Utility to validate and sanitize title
export function validateTitle(title: string): string {
  const sanitized = sanitizeString(title);
  return validateSchema(TitleSchema, sanitized);
}

// Utility to validate and sanitize description
export function validateDescription(description?: string): string | undefined {
  if (!description) return undefined;
  const sanitized = sanitizeString(description);
  return validateSchema(DescriptionSchema, sanitized);
}