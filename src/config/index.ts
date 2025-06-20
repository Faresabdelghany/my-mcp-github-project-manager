import { z } from 'zod';
import dotenv from 'dotenv';
import { createModuleLogger } from '@/utils/logger.js';

// Load environment variables
dotenv.config();

const logger = createModuleLogger('Config');

/**
 * Configuration schema for validation
 */
const ConfigSchema = z.object({
  // Environment
  environment: z.enum(['development', 'production', 'test']).default('development'),
  
  // Server configuration
  server: z.object({
    name: z.string().default('GitHub Project Manager MCP'),
    version: z.string().default('1.0.0'),
    host: z.string().default('localhost'),
    port: z.number().default(3000),
    timeout: z.number().default(30000),
  }),

  // GitHub configuration
  github: z.object({
    token: z.string().min(1, 'GitHub token is required'),
    apiUrl: z.string().url().default('https://api.github.com'),
    userAgent: z.string().default('GitHub-Project-Manager-MCP/1.0.0'),
    defaultOwner: z.string().optional(),
    defaultRepo: z.string().optional(),
    rateLimit: z.object({
      requests: z.number().default(5000),
      window: z.number().default(3600000), // 1 hour in ms
    }),
  }),

  // Logging configuration
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'text']).default('text'),
    enableColors: z.boolean().default(true),
    enableTimestamp: z.boolean().default(true),
    maxFiles: z.number().default(5),
    maxSize: z.string().default('10MB'),
  }),

  // Tool configuration
  tools: z.object({
    timeout: z.number().default(30000),
    retries: z.number().default(3),
    enableMetrics: z.boolean().default(true),
    enableCaching: z.boolean().default(false),
  }),

  // Features flags
  features: z.object({
    enableProjectsV2: z.boolean().default(true),
    enableAdvancedSearch: z.boolean().default(true),
    enableBulkOperations: z.boolean().default(false),
    enableWebhooks: z.boolean().default(false),
  }),
});

/**
 * Parse and validate configuration from environment variables
 */
function createConfig() {
  const rawConfig = {
    environment: process.env.NODE_ENV,
    server: {
      name: process.env.SERVER_NAME,
      version: process.env.SERVER_VERSION,
      host: process.env.SERVER_HOST,
      port: process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : undefined,
      timeout: process.env.SERVER_TIMEOUT ? parseInt(process.env.SERVER_TIMEOUT) : undefined,
    },
    github: {
      token: process.env.GITHUB_TOKEN,
      apiUrl: process.env.GITHUB_API_URL,
      userAgent: process.env.GITHUB_USER_AGENT,
      defaultOwner: process.env.GITHUB_DEFAULT_OWNER,
      defaultRepo: process.env.GITHUB_DEFAULT_REPO,
      rateLimit: {
        requests: process.env.GITHUB_RATE_LIMIT_REQUESTS ? parseInt(process.env.GITHUB_RATE_LIMIT_REQUESTS) : undefined,
        window: process.env.GITHUB_RATE_LIMIT_WINDOW ? parseInt(process.env.GITHUB_RATE_LIMIT_WINDOW) : undefined,
      },
    },
    logging: {
      level: process.env.LOG_LEVEL,
      format: process.env.LOG_FORMAT,
      enableColors: process.env.LOG_ENABLE_COLORS ? process.env.LOG_ENABLE_COLORS === 'true' : undefined,
      enableTimestamp: process.env.LOG_ENABLE_TIMESTAMP ? process.env.LOG_ENABLE_TIMESTAMP === 'true' : undefined,
      maxFiles: process.env.LOG_MAX_FILES ? parseInt(process.env.LOG_MAX_FILES) : undefined,
      maxSize: process.env.LOG_MAX_SIZE,
    },
    tools: {
      timeout: process.env.TOOLS_TIMEOUT ? parseInt(process.env.TOOLS_TIMEOUT) : undefined,
      retries: process.env.TOOLS_RETRIES ? parseInt(process.env.TOOLS_RETRIES) : undefined,
      enableMetrics: process.env.TOOLS_ENABLE_METRICS ? process.env.TOOLS_ENABLE_METRICS === 'true' : undefined,
      enableCaching: process.env.TOOLS_ENABLE_CACHING ? process.env.TOOLS_ENABLE_CACHING === 'true' : undefined,
    },
    features: {
      enableProjectsV2: process.env.FEATURE_PROJECTS_V2 ? process.env.FEATURE_PROJECTS_V2 === 'true' : undefined,
      enableAdvancedSearch: process.env.FEATURE_ADVANCED_SEARCH ? process.env.FEATURE_ADVANCED_SEARCH === 'true' : undefined,
      enableBulkOperations: process.env.FEATURE_BULK_OPERATIONS ? process.env.FEATURE_BULK_OPERATIONS === 'true' : undefined,
      enableWebhooks: process.env.FEATURE_WEBHOOKS ? process.env.FEATURE_WEBHOOKS === 'true' : undefined,
    },
  };

  try {
    const validatedConfig = ConfigSchema.parse(rawConfig);
    logger.info('Configuration loaded successfully', {
      environment: validatedConfig.environment,
      serverName: validatedConfig.server.name,
      hasGitHubToken: !!validatedConfig.github.token,
    });
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      logger.error('Configuration validation failed', { errors: errorMessages });
      throw new Error(`Configuration validation failed: ${errorMessages}`);
    }
    throw error;
  }
}

/**
 * Export the validated configuration
 */
export const config = createConfig();

/**
 * Configuration type
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Check if required configuration is present
 */
export function validateRequiredConfig(): void {
  const requiredFields = [
    'github.token'
  ];

  for (const field of requiredFields) {
    const keys = field.split('.');
    let value: any = config;
    
    for (const key of keys) {
      value = value?.[key];
    }

    if (!value) {
      throw new Error(`Required configuration field '${field}' is missing`);
    }
  }

  logger.info('Required configuration validation passed');
}

/**
 * Get configuration for a specific module
 */
export function getModuleConfig<K extends keyof Config>(module: K): Config[K] {
  return config[module];
}
