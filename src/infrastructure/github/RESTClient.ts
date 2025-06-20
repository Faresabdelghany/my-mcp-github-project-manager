import { Octokit } from '@octokit/rest';
import { throttle } from 'lodash';
import { logger } from '@/utils/logger.js';
import { GitHubAPIError, RateLimitError } from '@/utils/errors.js';
import { config } from '@/config/index.js';
import { cache } from '@/infrastructure/persistence/Cache.js';

export interface RESTOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  enableCaching?: boolean;
  cacheTTL?: number;
  enablePagination?: boolean;
  maxPaginationPages?: number;
}

export interface PaginationInfo {
  page: number;
  perPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  totalCount?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

export interface RequestOptions {
  useCache?: boolean;
  cacheTTL?: number;
  skipRateLimit?: boolean;
  timeout?: number;
}

export class RESTClient {
  private readonly octokit: Octokit;
  private readonly options: Required<RESTOptions>;
  private rateLimitInfo: {
    core: { limit: number; remaining: number; reset: Date; used: number };
    search: { limit: number; remaining: number; reset: Date; used: number };
    graphql: { limit: number; remaining: number; reset: Date; used: number };
  } | null = null;
  private readonly throttledRequest: (endpoint: string, options: any) => Promise<any>;

  constructor(options: RESTOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 30000,
      enableCaching: options.enableCaching ?? true,
      cacheTTL: options.cacheTTL ?? 300000, // 5 minutes
      enablePagination: options.enablePagination ?? true,
      maxPaginationPages: options.maxPaginationPages ?? 10
    };

    // Initialize Octokit with enhanced configuration
    this.octokit = new Octokit({
      auth: config.github.token,
      userAgent: config.github.userAgent || 'MCP-GitHub-Project-Manager/1.0',
      baseUrl: config.github.apiUrl || 'https://api.github.com',
      request: {
        timeout: this.options.timeout,
        retries: 0 // We handle retries manually
      },
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          logger.warn('Rate limit exceeded', { retryAfter, endpoint: options.url });
          return true; // Retry after rate limit reset
        },
        onAbuseLimit: (retryAfter: number, options: any) => {
          logger.error('Abuse detection triggered', { retryAfter, endpoint: options.url });
          return false; // Don't retry abuse limit
        }
      }
    });

    // Create throttled request function
    this.throttledRequest = throttle(
      this.executeRequest.bind(this),
      1000 / 5000 * 60 * 60, // 5000 requests per hour
      { leading: true, trailing: false }
    );

    // Set up request/response interceptors
    this.setupInterceptors();

    logger.info('REST client initialized', { options: this.options });
  }

  /**
   * Make a GET request
   */
  async get<T = any>(endpoint: string, params: any = {}, options: RequestOptions = {}): Promise<T> {
    const cacheKey = this.generateCacheKey('GET', endpoint, params);
    
    // Try cache first
    if (this.options.enableCaching && options.useCache !== false) {
      const cached = await cache.get<T>(cacheKey);
      if (cached) {
        logger.debug('Cache hit for GET request', { endpoint });
        return cached;
      }
    }

    const response = await this.throttledRequest(endpoint, {
      method: 'GET',
      ...params,
      timeout: options.timeout || this.options.timeout
    });

    // Cache the response
    if (this.options.enableCaching && options.useCache !== false) {
      await cache.set(cacheKey, response.data, options.cacheTTL || this.options.cacheTTL);
    }

    return response.data;
  }

  /**
   * Make a POST request
   */
  async post<T = any>(endpoint: string, data: any = {}, options: RequestOptions = {}): Promise<T> {
    const response = await this.throttledRequest(endpoint, {
      method: 'POST',
      data,
      timeout: options.timeout || this.options.timeout
    });

    // Invalidate related cache entries
    if (this.options.enableCaching) {
      await this.invalidateRelatedCache(endpoint);
    }

    return response.data;
  }

  /**
   * Make a PUT request
   */
  async put<T = any>(endpoint: string, data: any = {}, options: RequestOptions = {}): Promise<T> {
    const response = await this.throttledRequest(endpoint, {
      method: 'PUT',
      data,
      timeout: options.timeout || this.options.timeout
    });

    // Invalidate related cache entries
    if (this.options.enableCaching) {
      await this.invalidateRelatedCache(endpoint);
    }

    return response.data;
  }

  /**
   * Make a PATCH request
   */
  async patch<T = any>(endpoint: string, data: any = {}, options: RequestOptions = {}): Promise<T> {
    const response = await this.throttledRequest(endpoint, {
      method: 'PATCH',
      data,
      timeout: options.timeout || this.options.timeout
    });

    // Invalidate related cache entries
    if (this.options.enableCaching) {
      await this.invalidateRelatedCache(endpoint);
    }

    return response.data;
  }

  /**
   * Make a DELETE request
   */
  async delete<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.throttledRequest(endpoint, {
      method: 'DELETE',
      timeout: options.timeout || this.options.timeout
    });

    // Invalidate related cache entries
    if (this.options.enableCaching) {
      await this.invalidateRelatedCache(endpoint);
    }

    return response.data;
  }

  /**
   * Get paginated results
   */
  async paginate<T = any>(
    endpoint: string,
    params: any = {},
    options: RequestOptions & { maxPages?: number } = {}
  ): Promise<PaginatedResponse<T>> {
    if (!this.options.enablePagination) {
      const data = await this.get<T[]>(endpoint, params, options);
      return {
        data,
        pagination: {
          page: 1,
          perPage: data.length,
          hasNextPage: false,
          hasPreviousPage: false
        }
      };
    }

    const maxPages = options.maxPages || this.options.maxPaginationPages;
    const perPage = params.per_page || 30;
    let page = params.page || 1;
    let allData: T[] = [];
    let hasNextPage = true;
    let totalCount: number | undefined;

    while (hasNextPage && page <= maxPages) {
      const pageParams = { ...params, page, per_page: perPage };
      const response = await this.get<any>(endpoint, pageParams, options);
      
      let pageData: T[];
      if (Array.isArray(response)) {
        pageData = response;
      } else if (response.data && Array.isArray(response.data)) {
        pageData = response.data;
        totalCount = response.total_count;
      } else {
        pageData = [response];
      }

      allData = allData.concat(pageData);
      hasNextPage = pageData.length === perPage;
      page++;

      logger.debug('Fetched paginated data', { 
        endpoint, 
        page: page - 1, 
        itemCount: pageData.length,
        totalItems: allData.length 
      });
    }

    return {
      data: allData,
      pagination: {
        page: params.page || 1,
        perPage,
        hasNextPage: page <= maxPages && hasNextPage,
        hasPreviousPage: (params.page || 1) > 1,
        totalCount
      }
    };
  }

  /**
   * Get rate limit information
   */
  async getRateLimitInfo(): Promise<any> {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      this.updateRateLimitInfo(response.data);
      return this.rateLimitInfo;
    } catch (error) {
      logger.error('Failed to get rate limit info', { error });
      throw new GitHubAPIError('Failed to get rate limit information', 'RATE_LIMIT_INFO_ERROR');
    }
  }

  /**
   * Check if we're approaching rate limit
   */
  isApproachingRateLimit(resource = 'core', threshold = 100): boolean {
    if (!this.rateLimitInfo || !this.rateLimitInfo[resource as keyof typeof this.rateLimitInfo]) {
      return false;
    }
    
    const resourceInfo = this.rateLimitInfo[resource as keyof typeof this.rateLimitInfo];
    return resourceInfo.remaining < threshold;
  }

  /**
   * Wait until rate limit resets
   */
  async waitForRateLimit(resource = 'core'): Promise<void> {
    if (!this.rateLimitInfo || !this.rateLimitInfo[resource as keyof typeof this.rateLimitInfo]) {
      return;
    }

    const resourceInfo = this.rateLimitInfo[resource as keyof typeof this.rateLimitInfo];
    const now = new Date();
    const resetTime = resourceInfo.reset;
    const waitTime = resetTime.getTime() - now.getTime();

    if (waitTime > 0) {
      logger.info('Waiting for rate limit reset', { 
        resource,
        waitTime: Math.round(waitTime / 1000), 
        resetAt: resetTime.toISOString() 
      });
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Execute request with retry logic and error handling
   */
  private async executeRequest(endpoint: string, options: any): Promise<any> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        logger.debug('Executing REST request', { attempt, endpoint, method: options.method });
        
        // Make the request through Octokit
        const response = await this.octokit.request(`${options.method || 'GET'} ${endpoint}`, options);
        
        // Update rate limit info from headers
        this.updateRateLimitFromHeaders(response.headers);
        
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn('REST request failed', { 
          attempt, 
          error: lastError.message, 
          endpoint,
          method: options.method 
        });
        
        // Handle rate limiting
        if (this.isRateLimitError(lastError)) {
          if (attempt === this.options.maxRetries) {
            throw new RateLimitError(
              'GitHub REST API rate limit exceeded',
              'REST_RATE_LIMIT',
              { rateLimitInfo: this.rateLimitInfo, endpoint }
            );
          }
          
          await this.waitForRateLimit();
          continue;
        }
        
        // Handle other retryable errors
        if (this.isRetryableError(lastError) && attempt < this.options.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          logger.debug('Retrying REST request', { attempt, delay });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Non-retryable error or max retries reached
        throw new GitHubAPIError(
          `REST request failed after ${attempt} attempts: ${lastError.message}`,
          'REST_REQUEST_FAILED',
          { originalError: lastError, endpoint, options, attempts: attempt }
        );
      }
    }
    
    throw lastError!;
  }

  /**
   * Set up request/response interceptors
   */
  private setupInterceptors(): void {
    // Hook into Octokit's request lifecycle
    this.octokit.hook.before('request', async (options) => {
      logger.debug('Making GitHub API request', { 
        url: options.url, 
        method: options.method 
      });
    });

    this.octokit.hook.after('request', async (response, options) => {
      logger.debug('GitHub API request completed', { 
        url: options.url, 
        status: response.status,
        remaining: response.headers['x-ratelimit-remaining']
      });
    });

    this.octokit.hook.error('request', async (error, options) => {
      logger.error('GitHub API request failed', { 
        url: options.url, 
        error: error.message,
        status: error.status 
      });
      throw error;
    });
  }

  /**
   * Generate cache key for requests
   */
  private generateCacheKey(method: string, endpoint: string, params: any): string {
    const paramString = JSON.stringify(params);
    return `github:rest:${method}:${endpoint}:${Buffer.from(paramString).toString('base64')}`;
  }

  /**
   * Invalidate related cache entries
   */
  private async invalidateRelatedCache(endpoint: string): Promise<void> {
    // Extract resource type from endpoint
    const resourceMatch = endpoint.match(/\/(repos|issues|milestones|projects|users)\//i);
    if (resourceMatch) {
      const resource = resourceMatch[1].toLowerCase();
      await cache.invalidate(`github:rest:*:*${resource}*`);
      logger.debug('Invalidated cache for resource', { resource, endpoint });
    }
  }

  /**
   * Update rate limit information from response data
   */
  private updateRateLimitInfo(rateLimitData: any): void {
    this.rateLimitInfo = {
      core: {
        limit: rateLimitData.core.limit,
        remaining: rateLimitData.core.remaining,
        reset: new Date(rateLimitData.core.reset * 1000),
        used: rateLimitData.core.used
      },
      search: {
        limit: rateLimitData.search.limit,
        remaining: rateLimitData.search.remaining,
        reset: new Date(rateLimitData.search.reset * 1000),
        used: rateLimitData.search.used
      },
      graphql: {
        limit: rateLimitData.graphql.limit,
        remaining: rateLimitData.graphql.remaining,
        reset: new Date(rateLimitData.graphql.reset * 1000),
        used: rateLimitData.graphql.used
      }
    };
    
    logger.debug('Rate limit updated', this.rateLimitInfo);
  }

  /**
   * Update rate limit information from response headers
   */
  private updateRateLimitFromHeaders(headers: any): void {
    if (headers['x-ratelimit-limit']) {
      const now = new Date();
      const resetTime = new Date(parseInt(headers['x-ratelimit-reset']) * 1000);
      
      if (!this.rateLimitInfo) {
        this.rateLimitInfo = {
          core: { limit: 0, remaining: 0, reset: now, used: 0 },
          search: { limit: 0, remaining: 0, reset: now, used: 0 },
          graphql: { limit: 0, remaining: 0, reset: now, used: 0 }
        };
      }
      
      this.rateLimitInfo.core = {
        limit: parseInt(headers['x-ratelimit-limit']),
        remaining: parseInt(headers['x-ratelimit-remaining']),
        reset: resetTime,
        used: parseInt(headers['x-ratelimit-used'] || '0')
      };
    }
  }

  /**
   * Check if error is rate limit related
   */
  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('exceeded') ||
           (error as any).status === 403;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const status = (error as any).status;
    
    return message.includes('timeout') ||
           message.includes('network') ||
           message.includes('connection') ||
           status === 500 ||
           status === 502 ||
           status === 503 ||
           status === 504;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.options.retryDelay;
    const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
    return baseDelay * Math.pow(2, attempt - 1) + jitter;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    logger.info('REST client destroyed');
  }
}

// Singleton instance
let restClientInstance: RESTClient | null = null;

export function getRESTClient(options?: RESTOptions): RESTClient {
  if (!restClientInstance) {
    restClientInstance = new RESTClient(options);
  }
  return restClientInstance;
}