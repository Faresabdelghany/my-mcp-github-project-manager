import winston from 'winston';
import { config } from '@/config/index.js';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}${stackStr}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.server.logLevel,
  format: logFormat,
  defaultMeta: { service: 'mcp-github-project-manager' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
  ],
});

// Add file transport for production
if (config.server.nodeEnv === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create context-aware loggers for different modules
export function createModuleLogger(module: string) {
  return {
    error: (message: string, meta?: any) => logger.error(message, { module, ...meta }),
    warn: (message: string, meta?: any) => logger.warn(message, { module, ...meta }),
    info: (message: string, meta?: any) => logger.info(message, { module, ...meta }),
    debug: (message: string, meta?: any) => logger.debug(message, { module, ...meta }),
  };
}

// Export default logger
export default logger;