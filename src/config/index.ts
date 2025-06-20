import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Configuration schema with validation
const ConfigSchema = z.object({
  // GitHub Configuration
  github: z.object({
    token: z.string().min(1, 'GitHub token is required'),
    owner: z.string().min(1, 'GitHub owner is required'),
    repo: z.string().min(1, 'GitHub repository is required'),
    apiRateLimit: z.number().default(5000),
    apiRateWindow: z.number().default(3600000), // 1 hour in ms
  }),

  // Server Configuration
  server: z.object({
    port: z.number().default(3001),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  }),

  // Cache Configuration
  cache: z.object({
    directory: z.string().default('.mcp-cache'),
    ttlSeconds: z.number().default(3600),
  }),

  // Sync Configuration
  sync: z.object({
    enabled: z.boolean().default(true),
    timeoutMs: z.number().default(30000),
    intervalMs: z.number().default(0), // 0 = disabled
    resources: z.array(z.enum(['PROJECT', 'MILESTONE', 'ISSUE', 'SPRINT'])).default([
      'PROJECT', 'MILESTONE', 'ISSUE', 'SPRINT'
    ]),
  }),

  // Webhook Configuration
  webhook: z.object({
    secret: z.string().optional(),
    port: z.number().default(3001),
    sseEnabled: z.boolean().default(true),
    eventRetentionDays: z.number().default(7),
    maxEventsInMemory: z.number().default(1000),
    timeoutMs: z.number().default(5000),
  }),

  // Features
  features: z.object({
    traceability: z.boolean().default(true),
    webhooks: z.boolean().default(true),
    persistence: z.boolean().default(true),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// Create configuration from environment variables
function createConfig(): Config {
  const config = {
    github: {
      token: process.env.GITHUB_TOKEN || '',
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
      apiRateLimit: parseInt(process.env.GITHUB_API_RATE_LIMIT || '5000'),
      apiRateWindow: parseInt(process.env.GITHUB_API_RATE_WINDOW || '3600000'),
    },
    server: {
      port: parseInt(process.env.PORT || '3001'),
      nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
      logLevel: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
    },
    cache: {
      directory: process.env.CACHE_DIRECTORY || '.mcp-cache',
      ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '3600'),
    },
    sync: {
      enabled: process.env.SYNC_ENABLED !== 'false',
      timeoutMs: parseInt(process.env.SYNC_TIMEOUT_MS || '30000'),
      intervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '0'),
      resources: (process.env.SYNC_RESOURCES || 'PROJECT,MILESTONE,ISSUE,SPRINT')
        .split(',')
        .map(r => r.trim()) as Array<'PROJECT' | 'MILESTONE' | 'ISSUE' | 'SPRINT'>,
    },
    webhook: {
      secret: process.env.WEBHOOK_SECRET,
      port: parseInt(process.env.WEBHOOK_PORT || '3001'),
      sseEnabled: process.env.SSE_ENABLED !== 'false',
      eventRetentionDays: parseInt(process.env.EVENT_RETENTION_DAYS || '7'),
      maxEventsInMemory: parseInt(process.env.MAX_EVENTS_IN_MEMORY || '1000'),
      timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '5000'),
    },
    features: {
      traceability: process.env.ENABLE_TRACEABILITY !== 'false',
      webhooks: process.env.ENABLE_WEBHOOKS !== 'false',
      persistence: process.env.ENABLE_PERSISTENCE !== 'false',
    },
  };

  // Validate configuration
  try {
    return ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Configuration validation failed:\n${issues.join('\n')}`);
    }
    throw error;
  }
}

// Export the configuration instance
export const config = createConfig();

// Helper function to get cache path
export function getCachePath(filename: string): string {
  return path.join(config.cache.directory, filename);
}

// Helper function to check if feature is enabled
export function isFeatureEnabled(feature: keyof Config['features']): boolean {
  return config.features[feature];
}