#!/usr/bin/env node

import { Command } from 'commander';
import { MCPGitHubProjectManager } from './server.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

// Create CLI program
const program = new Command();

program
  .name('mcp-github-project-manager')
  .description('MCP server for GitHub project management with requirements traceability')
  .version(packageJson.version);

// Main command to start the server
program
  .option('-t, --token <token>', 'GitHub personal access token')
  .option('-o, --owner <owner>', 'GitHub repository owner')
  .option('-r, --repo <repo>', 'GitHub repository name')
  .option('-e, --env-file <path>', 'Path to .env file')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--skip-sync', 'Skip initial synchronization')
  .option('--cache-dir <path>', 'Custom cache directory')
  .action(async (options) => {
    try {
      // Override config with CLI options if provided
      if (options.token) process.env.GITHUB_TOKEN = options.token;
      if (options.owner) process.env.GITHUB_OWNER = options.owner;
      if (options.repo) process.env.GITHUB_REPO = options.repo;
      if (options.verbose) process.env.LOG_LEVEL = 'debug';
      if (options.skipSync) process.env.SYNC_ENABLED = 'false';
      if (options.cacheDir) process.env.CACHE_DIRECTORY = options.cacheDir;

      // Load custom env file if specified
      if (options.envFile) {
        const dotenv = await import('dotenv');
        dotenv.config({ path: options.envFile });
      }

      logger.info('Starting MCP GitHub Project Manager...', {
        version: packageJson.version,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      });

      // Validate configuration
      validateConfig();

      // Create and start server
      const server = new MCPGitHubProjectManager();
      await server.start();

      // Handle graceful shutdown
      setupGracefulShutdown(server);

    } catch (error) {
      logger.error('Failed to start server:', { error });
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Check server configuration and environment')
  .action(() => {
    try {
      logger.info('Configuration Status:', {
        github: {
          tokenConfigured: !!process.env.GITHUB_TOKEN,
          owner: process.env.GITHUB_OWNER || 'Not configured',
          repo: process.env.GITHUB_REPO || 'Not configured',
        },
        server: {
          nodeEnv: config.server.nodeEnv,
          logLevel: config.server.logLevel,
          port: config.server.port,
        },
        features: config.features,
        cache: {
          directory: config.cache.directory,
          ttlSeconds: config.cache.ttlSeconds,
        },
        sync: config.sync,
      });

      console.log('\n✅ Configuration validated successfully');
    } catch (error) {
      logger.error('Configuration validation failed:', { error });
      process.exit(1);
    }
  });

// Version command (already handled by commander)
program
  .command('version')
  .description('Display version information')
  .action(() => {
    console.log(`${packageJson.name} v${packageJson.version}`);
    console.log(`Node.js ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
  });

// Validate configuration
function validateConfig() {
  const requiredEnvVars = [
    'GITHUB_TOKEN',
    'GITHUB_OWNER', 
    'GITHUB_REPO'
  ];

  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    logger.error('Missing required environment variables:', { missing });
    console.error('\nRequired environment variables:');
    console.error('- GITHUB_TOKEN: Your GitHub personal access token');
    console.error('- GITHUB_OWNER: Repository owner (username or organization)');
    console.error('- GITHUB_REPO: Repository name');
    console.error('\nYou can also pass these as command line arguments.');
    console.error('See --help for more information.');
    process.exit(1);
  }

  // Validate GitHub token format
  const token = process.env.GITHUB_TOKEN!;
  if (!token.match(/^gh[ps]_[A-Za-z0-9_]{36,255}$/)) {
    logger.warn('GitHub token format may be invalid. Expected format: ghp_... or ghs_...');
  }

  logger.info('Configuration validated successfully');
}

// Setup graceful shutdown handlers
function setupGracefulShutdown(server: MCPGitHubProjectManager) {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      await server.stop();
      logger.info('Server stopped successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', { error });
      process.exit(1);
    }
  };

  // Handle various shutdown signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', { error });
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', { reason, promise });
    process.exit(1);
  });
}

// Export for testing
export { MCPGitHubProjectManager };

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}