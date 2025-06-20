import { logger } from '@/utils/logger.js';
import { ServiceError } from '@/utils/errors.js';

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  memoryUsage: number;
  totalKeys: number;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

export type CachePolicy = 'LRU' | 'LFU' | 'FIFO';

export interface CacheOptions {
  maxSize: number;
  defaultTTL: number;
  policy: CachePolicy;
  maxMemoryMB: number;
  cleanupInterval: number;
}

export class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
    memoryUsage: 0,
    totalKeys: 0
  };
  private cleanupTimer?: NodeJS.Timeout;
  private readonly options: CacheOptions;

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      maxSize: options.maxSize ?? 10000,
      defaultTTL: options.defaultTTL ?? 300000, // 5 minutes
      policy: options.policy ?? 'LRU',
      maxMemoryMB: options.maxMemoryMB ?? 100,
      cleanupInterval: options.cleanupInterval ?? 60000 // 1 minute
    };

    this.startCleanupTimer();
    logger.info('Cache manager initialized', { options: this.options });
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expiresAt = Date.now() + (ttl ?? this.options.defaultTTL);
    const size = this.estimateSize(value);
    
    // Check memory limits
    if (this.getMemoryUsageMB() + (size / (1024 * 1024)) > this.options.maxMemoryMB) {
      await this.evictEntries();
    }

    // Check size limits
    if (this.cache.size >= this.options.maxSize) {
      await this.evictEntries();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      accessCount: 0,
      lastAccessed: Date.now(),
      size
    };

    this.cache.set(key, entry);
    this.stats.sets++;
    this.updateStats();

    logger.debug('Cache entry set', { key, ttl, size });
  }

  async invalidate(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.stats.deletes++;
    }

    this.updateStats();
    logger.info('Cache invalidated', { pattern, deletedKeys: keysToDelete.length });
  }

  async clear(): Promise<void> {
    const keyCount = this.cache.size;
    this.cache.clear();
    this.stats.deletes += keyCount;
    this.updateStats();
    logger.info('Cache cleared', { deletedKeys: keyCount });
  }

  stats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  async warmup(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    logger.info('Starting cache warmup', { entryCount: entries.length });
    
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }

    logger.info('Cache warmup completed');
  }

  async prefetch(keys: string[], fetcher: (key: string) => Promise<any>): Promise<void> {
    const missingKeys = keys.filter(key => !this.cache.has(key));
    
    if (missingKeys.length === 0) {
      return;
    }

    logger.info('Prefetching cache entries', { keys: missingKeys });
    
    const promises = missingKeys.map(async (key) => {
      try {
        const value = await fetcher(key);
        await this.set(key, value);
      } catch (error) {
        logger.warn('Failed to prefetch cache entry', { key, error });
      }
    });

    await Promise.allSettled(promises);
  }

  private async evictEntries(): Promise<void> {
    const entriesToEvict = Math.max(1, Math.floor(this.cache.size * 0.1)); // Evict 10%
    const entries = Array.from(this.cache.entries());
    
    let sortedEntries: Array<[string, CacheEntry<any>]>;
    
    switch (this.options.policy) {
      case 'LRU':
        sortedEntries = entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        break;
      case 'LFU':
        sortedEntries = entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
        break;
      case 'FIFO':
      default:
        sortedEntries = entries.sort((a, b) => (a[1].expiresAt - a[1].lastAccessed) - (b[1].expiresAt - b[1].lastAccessed));
        break;
    }

    for (let i = 0; i < entriesToEvict && i < sortedEntries.length; i++) {
      const [key] = sortedEntries[i];
      this.cache.delete(key);
      this.stats.deletes++;
    }

    logger.debug('Cache entries evicted', { count: entriesToEvict, policy: this.options.policy });
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.stats.deletes++;
    }

    this.updateStats();
    
    if (expiredKeys.length > 0) {
      logger.debug('Expired cache entries cleaned up', { count: expiredKeys.length });
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  private updateHitRate(): void {
    const totalRequests = this.stats.hits + this.stats.misses;
    this.stats.hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
  }

  private updateStats(): void {
    this.stats.totalKeys = this.cache.size;
    this.stats.memoryUsage = this.getMemoryUsageMB();
    this.updateHitRate();
  }

  private getMemoryUsageMB(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    return totalSize / (1024 * 1024);
  }

  private estimateSize(value: any): number {
    // Rough estimation of object size in bytes
    const json = JSON.stringify(value);
    return new Blob([json]).size;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cache.clear();
    logger.info('Cache manager destroyed');
  }
}

// Singleton instance
export const cache = new CacheManager();

// Cache decorator for methods
export function Cached(ttl?: number, keyGenerator?: (...args: any[]) => string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator 
        ? keyGenerator(...args)
        : `${target.constructor.name}.${propertyKey}:${JSON.stringify(args)}`;
      
      // Try to get from cache first
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute original method and cache result
      const result = await originalMethod.apply(this, args);
      await cache.set(cacheKey, result, ttl);
      
      return result;
    };

    return descriptor;
  };
}