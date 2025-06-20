import { z } from 'zod';
import { createModuleLogger } from './logger.js';

const logger = createModuleLogger('Validation');

/**
 * Common validation schemas
 */
export const TitleSchema = z.string()
  .min(1, 'Title is required')
  .max(255, 'Title must be less than 255 characters')
  .trim();

export const DescriptionSchema = z.string()
  .max(65535, 'Description must be less than 65535 characters')
  .trim();

export const StateSchema = z.enum(['open', 'closed'], {
  errorMap: () => ({ message: 'State must be either open or closed' })
});

export const LabelSchema = z.string()
  .min(1, 'Label cannot be empty')
  .max(50, 'Label must be less than 50 characters')
  .trim();

export const StringArraySchema = z.array(z.string().trim().min(1))
  .min(1, 'At least one item is required');

export const DateStringSchema = z.string()
  .refine(val => !isNaN(Date.parse(val)), {
    message: 'Invalid date format'
  });

export const OptionalDateStringSchema = z.string()
  .refine(val => val === '' || !isNaN(Date.parse(val)), {
    message: 'Invalid date format'
  })
  .optional();

export const EmailSchema = z.string()
  .email('Invalid email format')
  .max(254, 'Email must be less than 254 characters');

export const UrlSchema = z.string()
  .url('Invalid URL format')
  .max(2048, 'URL must be less than 2048 characters');

export const PositiveIntegerSchema = z.number()
  .int('Must be an integer')
  .positive('Must be a positive number');

export const NonNegativeIntegerSchema = z.number()
  .int('Must be an integer')
  .min(0, 'Must be non-negative');

/**
 * Validate data against a Zod schema
 */
export async function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  options?: {
    stripUnknown?: boolean;
    logErrors?: boolean;
  }
): Promise<T> {
  const { stripUnknown = true, logErrors = true } = options || {};

  try {
    if (stripUnknown) {
      return schema.parse(data);
    } else {
      return schema.strict().parse(data);
    }
  } catch (error) {
    if (error instanceof z.ZodError && logErrors) {
      const errorMessages = error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        received: err.received
      }));
      
      logger.error('Schema validation failed', {
        schema: schema.constructor.name,
        errors: errorMessages,
        data: typeof data === 'object' ? JSON.stringify(data) : data
      });
    }
    throw error;
  }
}

/**
 * Create a validation error message from Zod error
 */
export function formatValidationError(error: z.ZodError): string {
  return error.errors
    .map(err => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}

/**
 * Validate and sanitize user input
 */
export function sanitizeInput(input: string, options?: {
  maxLength?: number;
  allowedCharacters?: RegExp;
  trim?: boolean;
}): string {
  const { maxLength = 1000, allowedCharacters, trim = true } = options || {};
  
  let sanitized = input;
  
  if (trim) {
    sanitized = sanitized.trim();
  }
  
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  if (allowedCharacters && !allowedCharacters.test(sanitized)) {
    throw new Error('Input contains invalid characters');
  }
  
  return sanitized;
}

/**
 * Validate GitHub username format
 */
export const GitHubUsernameSchema = z.string()
  .min(1, 'Username is required')
  .max(39, 'Username must be less than 39 characters')
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/, 
    'Invalid GitHub username format');

/**
 * Validate GitHub repository name format
 */
export const GitHubRepoNameSchema = z.string()
  .min(1, 'Repository name is required')
  .max(100, 'Repository name must be less than 100 characters')
  .regex(/^[a-zA-Z0-9._-]+$/, 
    'Repository name can only contain alphanumeric characters, periods, hyphens, and underscores');

/**
 * Validate semver version format
 */
export const SemverSchema = z.string()
  .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)?(?:\+[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)?$/, 
    'Invalid semantic version format');

/**
 * Validate color hex code
 */
export const HexColorSchema = z.string()
  .regex(/^#?[0-9A-Fa-f]{6}$/, 'Invalid hex color format');

/**
 * Custom validation for pagination parameters
 */
export const PaginationSchema = z.object({
  page: z.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(30),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc')
});

/**
 * Validate and parse comma-separated values
 */
export function parseCommaSeparatedValues(input: string): string[] {
  if (!input || input.trim() === '') {
    return [];
  }
  
  return input
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Validate file size
 */
export function validateFileSize(size: number, maxSizeBytes: number): boolean {
  return size > 0 && size <= maxSizeBytes;
}

/**
 * Validate MIME type
 */
export function validateMimeType(mimeType: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(mimeType);
}
