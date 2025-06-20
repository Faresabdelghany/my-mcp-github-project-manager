import winston from 'winston';
import { config } from '@/config/index.js';

/**
 * Create a Winston logger instance with consistent formatting
 */
function createLogger() {
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
      const logObject = {
        timestamp,
        level,
        module,
        message,
        ...meta
      };
      
      if (config.logging.format === 'json') {
        return JSON.stringify(logObject);
      }
      
      // Text format
      let logLine = `${timestamp} [${level.toUpperCase()}]`;
      if (module) {
        logLine += ` [${module}]`;
      }
      logLine += ` ${message}`;
      
      if (Object.keys(meta).length > 0) {
        logLine += ` ${JSON.stringify(meta)}`;
      }
      
      return logLine;
    })
  );

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: config.logging.enableColors ? 
        winston.format.combine(winston.format.colorize(), logFormat) : 
        logFormat
    })
  ];

  // Add file transport in production
  if (config.environment === 'production') {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: parseSize(config.logging.maxSize),
        maxFiles: config.logging.maxFiles
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: parseSize(config.logging.maxSize),
        maxFiles: config.logging.maxFiles
      })
    );
  }

  return winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    transports,
    exitOnError: false
  });
}

/**
 * Parse size string to bytes
 */
function parseSize(sizeStr: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024
  };
  
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }
  
  const [, size, unit] = match;
  return parseFloat(size) * units[unit.toUpperCase()];
}

// Create the main logger instance
const logger = createLogger();

/**
 * Create a module-specific logger
 */
export function createModuleLogger(moduleName: string) {
  return {
    error: (message: string, meta?: any) => logger.error(message, { module: moduleName, ...meta }),
    warn: (message: string, meta?: any) => logger.warn(message, { module: moduleName, ...meta }),
    info: (message: string, meta?: any) => logger.info(message, { module: moduleName, ...meta }),
    debug: (message: string, meta?: any) => logger.debug(message, { module: moduleName, ...meta }),
  };
}

/**
 * Log performance metrics
 */
export function logPerformance(operation: string, startTime: number, meta?: any) {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation}`, {
    module: 'Performance',
    operation,
    duration,
    ...meta
  });
}

/**
 * Log API call metrics
 */
export function logApiCall(
  method: string, 
  url: string, 
  statusCode: number, 
  duration: number, 
  meta?: any
) {
  const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
  
  logger[level](`API Call: ${method} ${url}`, {
    module: 'API',
    method,
    url,
    statusCode,
    duration,
    ...meta
  });
}

/**
 * Log security events
 */
export function logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', meta?: any) {
  const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  
  logger[level](`Security Event: ${event}`, {
    module: 'Security',
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...meta
  });
}

/**
 * Export the main logger instance
 */
export { logger };
export default logger;
