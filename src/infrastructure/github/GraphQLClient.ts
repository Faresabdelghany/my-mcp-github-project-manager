import { graphql } from '@octokit/graphql';
import { throttle } from 'lodash';
import { logger } from '@/utils/logger.js';
import { GitHubAPIError, RateLimitError } from '@/utils/errors.js';
import { config } from '@/config/index.js';

export interface GraphQLOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  enableBatching?: boolean;
  maxBatchSize?: number;
}

export interface GraphQLResponse<T = any> {
  data: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
  extensions?: {
    rateLimit?: {
      limit: number;
      remaining: number;
      resetAt: string;
      used: number;
    };
  };
}

export interface GraphQLQuery {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

export interface BatchedQuery {
  id: string;
  query: GraphQLQuery;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

export class GraphQLClient {
  private readonly client: typeof graphql;
  private readonly options: Required<GraphQLOptions>;
  private rateLimitInfo: {
    limit: number;
    remaining: number;
    resetAt: Date;
    used: number;
  } | null = null;
  private batchQueue: BatchedQuery[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly throttledRequest: (query: string, variables?: Record<string, any>) => Promise<any>;

  constructor(options: GraphQLOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 30000,
      enableBatching: options.enableBatching ?? true,
      maxBatchSize: options.maxBatchSize ?? 10
    };

    // Initialize GraphQL client with authentication
    this.client = graphql.defaults({
      headers: {
        authorization: `token ${config.github.token}`,
        'user-agent': config.github.userAgent || 'MCP-GitHub-Project-Manager/1.0'
      },
      request: {
        timeout: this.options.timeout
      }
    });

    // Create throttled request function to respect rate limits
    this.throttledRequest = throttle(
      this.executeQuery.bind(this),
      1000 / 5000 * 60 * 60, // 5000 requests per hour
      { leading: true, trailing: false }
    );

    logger.info('GraphQL client initialized', { options: this.options });
  }

  /**
   * Execute a single GraphQL query
   */
  async query<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
    if (this.options.enableBatching) {
      return this.addToBatch({ query, variables });
    }

    return this.throttledRequest(query, variables);
  }

  /**
   * Execute multiple GraphQL queries in a batch
   */
  async batchQuery<T = any>(queries: GraphQLQuery[]): Promise<T[]> {
    if (!this.options.enableBatching) {
      // Execute queries sequentially if batching is disabled
      const results: T[] = [];
      for (const query of queries) {
        const result = await this.query(query.query, query.variables);
        results.push(result);
      }
      return results;
    }

    // Create batch query
    const batchQuery = this.createBatchQuery(queries);
    const response = await this.throttledRequest(batchQuery.query, batchQuery.variables);
    
    // Extract individual results from batch response
    return this.extractBatchResults(response, queries.length);
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo() {
    return this.rateLimitInfo ? { ...this.rateLimitInfo } : null;
  }

  /**
   * Check if we're approaching rate limit
   */
  isApproachingRateLimit(threshold = 100): boolean {
    return this.rateLimitInfo ? this.rateLimitInfo.remaining < threshold : false;
  }

  /**
   * Wait until rate limit resets
   */
  async waitForRateLimit(): Promise<void> {
    if (!this.rateLimitInfo) {
      return;
    }

    const now = new Date();
    const resetTime = this.rateLimitInfo.resetAt;
    const waitTime = resetTime.getTime() - now.getTime();

    if (waitTime > 0) {
      logger.info('Waiting for rate limit reset', { 
        waitTime: Math.round(waitTime / 1000), 
        resetAt: resetTime.toISOString() 
      });
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Execute query with retry logic and error handling
   */
  private async executeQuery(query: string, variables?: Record<string, any>): Promise<any> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        logger.debug('Executing GraphQL query', { attempt, query: query.substring(0, 100) + '...' });
        
        const response: GraphQLResponse = await this.client(query, variables);
        
        // Update rate limit information
        if (response.extensions?.rateLimit) {
          this.updateRateLimitInfo(response.extensions.rateLimit);
        }
        
        // Check for GraphQL errors
        if (response.errors && response.errors.length > 0) {
          throw new GitHubAPIError(
            `GraphQL errors: ${response.errors.map(e => e.message).join(', ')}`,
            'GRAPHQL_ERROR',
            { errors: response.errors, query, variables }
          );
        }
        
        return response.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn('GraphQL query failed', { 
          attempt, 
          error: lastError.message, 
          query: query.substring(0, 100) + '...' 
        });
        
        // Handle rate limiting
        if (this.isRateLimitError(lastError)) {
          if (attempt === this.options.maxRetries) {
            throw new RateLimitError(
              'GitHub GraphQL API rate limit exceeded',
              'GRAPHQL_RATE_LIMIT',
              { rateLimitInfo: this.rateLimitInfo }
            );
          }
          
          await this.waitForRateLimit();
          continue;
        }
        
        // Handle other retryable errors
        if (this.isRetryableError(lastError) && attempt < this.options.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          logger.debug('Retrying GraphQL query', { attempt, delay });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Non-retryable error or max retries reached
        throw new GitHubAPIError(
          `GraphQL query failed after ${attempt} attempts: ${lastError.message}`,
          'GRAPHQL_REQUEST_FAILED',
          { originalError: lastError, query, variables, attempts: attempt }
        );
      }
    }
    
    throw lastError!;
  }

  /**
   * Add query to batch queue
   */
  private async addToBatch<T>(queryObj: GraphQLQuery): Promise<T> {
    return new Promise((resolve, reject) => {
      const batchItem: BatchedQuery = {
        id: this.generateBatchId(),
        query: queryObj,
        resolve,
        reject
      };
      
      this.batchQueue.push(batchItem);
      
      // Process batch if it reaches max size
      if (this.batchQueue.length >= this.options.maxBatchSize) {
        this.processBatch();
      } else if (!this.batchTimer) {
        // Set timer to process batch after a short delay
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, 100); // 100ms batching window
      }
    });
  }

  /**
   * Process queued batch of queries
   */
  private async processBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.batchQueue.length === 0) {
      return;
    }
    
    const batch = this.batchQueue.splice(0, this.options.maxBatchSize);
    
    try {
      const queries = batch.map(item => item.query);
      const results = await this.batchQuery(queries);
      
      // Resolve individual promises
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      // Reject all promises in the batch
      batch.forEach(item => {
        item.reject(error);
      });
    }
  }

  /**
   * Create a batched GraphQL query
   */
  private createBatchQuery(queries: GraphQLQuery[]): { query: string; variables: Record<string, any> } {
    // This is a simplified batch implementation
    // In practice, you might want to use GraphQL query batching or aliases
    const batchedQueries = queries.map((q, index) => {
      // Create aliased queries
      const alias = `query${index}`;
      return q.query.replace(/^(query|mutation)/, `${alias}: $1`);
    }).join('\n');
    
    const combinedVariables = queries.reduce((acc, q, index) => {
      if (q.variables) {
        Object.keys(q.variables).forEach(key => {
          acc[`${key}_${index}`] = q.variables![key];
        });
      }
      return acc;
    }, {} as Record<string, any>);
    
    return {
      query: `{ ${batchedQueries} }`,
      variables: combinedVariables
    };
  }

  /**
   * Extract individual results from batch response
   */
  private extractBatchResults<T>(response: any, queryCount: number): T[] {
    const results: T[] = [];
    
    for (let i = 0; i < queryCount; i++) {
      const alias = `query${i}`;
      results.push(response[alias]);
    }
    
    return results;
  }

  /**
   * Update rate limit information from response
   */
  private updateRateLimitInfo(rateLimit: any): void {
    this.rateLimitInfo = {
      limit: rateLimit.limit,
      remaining: rateLimit.remaining,
      resetAt: new Date(rateLimit.resetAt),
      used: rateLimit.used
    };
    
    logger.debug('Rate limit updated', this.rateLimitInfo);
  }

  /**
   * Check if error is rate limit related
   */
  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('exceeded') ||
           message.includes('403') && message.includes('limit');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('timeout') ||
           message.includes('network') ||
           message.includes('connection') ||
           message.includes('500') ||
           message.includes('502') ||
           message.includes('503') ||
           message.includes('504');
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    return this.options.retryDelay * Math.pow(2, attempt - 1);
  }

  /**
   * Generate unique ID for batch items
   */
  private generateBatchId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Reject any pending batch items
    this.batchQueue.forEach(item => {
      item.reject(new Error('GraphQL client destroyed'));
    });
    this.batchQueue = [];
    
    logger.info('GraphQL client destroyed');
  }
}

// Singleton instance
let graphqlClientInstance: GraphQLClient | null = null;

export function getGraphQLClient(options?: GraphQLOptions): GraphQLClient {
  if (!graphqlClientInstance) {
    graphqlClientInstance = new GraphQLClient(options);
  }
  return graphqlClientInstance;
}