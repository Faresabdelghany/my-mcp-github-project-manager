import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { logger } from '@/utils/logger.js';
import { ServiceError } from '@/utils/errors.js';

export interface FileSystemOptions {
  baseDir: string;
  enableCompression: boolean;
  enableBackups: boolean;
  maxBackups: number;
  lockTimeout: number;
}

export interface FileMetadata {
  path: string;
  size: number;
  created: Date;
  modified: Date;
  checksum: string;
  compressed: boolean;
}

export interface DirectoryIndex {
  files: Map<string, FileMetadata>;
  lastUpdated: Date;
  totalSize: number;
  fileCount: number;
}

export class FileSystemManager {
  private readonly options: FileSystemOptions;
  private readonly locks = new Map<string, Promise<void>>();
  private readonly indexes = new Map<string, DirectoryIndex>();

  constructor(options: Partial<FileSystemOptions> = {}) {
    this.options = {
      baseDir: options.baseDir ?? './data',
      enableCompression: options.enableCompression ?? true,
      enableBackups: options.enableBackups ?? true,
      maxBackups: options.maxBackups ?? 5,
      lockTimeout: options.lockTimeout ?? 30000 // 30 seconds
    };
  }

  async initialize(): Promise<void> {
    try {
      await this.ensureDirectory(this.options.baseDir);
      await this.ensureDirectory(join(this.options.baseDir, 'backups'));
      await this.ensureDirectory(join(this.options.baseDir, 'temp'));
      await this.rebuildIndexes();
      logger.info('FileSystem manager initialized', { options: this.options });
    } catch (error) {
      throw new ServiceError(
        'Failed to initialize file system',
        'FILESYSTEM_INIT_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async writeFile(relativePath: string, data: any, options: { atomic?: boolean; compress?: boolean } = {}): Promise<void> {
    const filePath = join(this.options.baseDir, relativePath);
    const { atomic = true, compress = this.options.enableCompression } = options;
    
    return this.withLock(filePath, async () => {
      try {
        await this.ensureDirectory(dirname(filePath));
        
        // Create backup if file exists
        if (this.options.enableBackups && await this.exists(filePath)) {
          await this.createBackup(filePath);
        }

        const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        
        if (atomic) {
          await this.atomicWrite(filePath, content, compress);
        } else {
          await this.directWrite(filePath, content, compress);
        }

        await this.updateIndex(dirname(relativePath));
        logger.debug('File written', { path: relativePath, atomic, compress });
      } catch (error) {
        throw new ServiceError(
          `Failed to write file: ${relativePath}`,
          'FILESYSTEM_WRITE_ERROR',
          { path: relativePath, error: error instanceof Error ? error.message : String(error) }
        );
      }
    });
  }

  async readFile(relativePath: string, options: { decompress?: boolean } = {}): Promise<string> {
    const filePath = join(this.options.baseDir, relativePath);
    const { decompress = true } = options;
    
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      const isCompressed = extname(filePath) === '.gz' || relativePath.endsWith('.gz');
      
      if (isCompressed && decompress) {
        return await this.readCompressedFile(filePath);
      } else {
        return await fs.readFile(filePath, 'utf-8');
      }
    } catch (error) {
      throw new ServiceError(
        `Failed to read file: ${relativePath}`,
        'FILESYSTEM_READ_ERROR',
        { path: relativePath, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async readFileAsJSON<T>(relativePath: string): Promise<T> {
    const content = await this.readFile(relativePath);
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      throw new ServiceError(
        `Failed to parse JSON file: ${relativePath}`,
        'FILESYSTEM_JSON_PARSE_ERROR',
        { path: relativePath, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    const filePath = join(this.options.baseDir, relativePath);
    
    return this.withLock(filePath, async () => {
      try {
        if (await this.exists(filePath)) {
          // Create backup before deletion
          if (this.options.enableBackups) {
            await this.createBackup(filePath);
          }
          
          await fs.unlink(filePath);
          await this.updateIndex(dirname(relativePath));
          logger.debug('File deleted', { path: relativePath });
        }
      } catch (error) {
        throw new ServiceError(
          `Failed to delete file: ${relativePath}`,
          'FILESYSTEM_DELETE_ERROR',
          { path: relativePath, error: error instanceof Error ? error.message : String(error) }
        );
      }
    });
  }

  async listFiles(relativePath: string = '', pattern?: RegExp): Promise<FileMetadata[]> {
    const dirPath = join(this.options.baseDir, relativePath);
    
    try {
      const index = await this.getOrCreateIndex(relativePath);
      let files = Array.from(index.files.values());
      
      if (pattern) {
        files = files.filter(file => pattern.test(basename(file.path)));
      }
      
      return files;
    } catch (error) {
      throw new ServiceError(
        `Failed to list files in: ${relativePath}`,
        'FILESYSTEM_LIST_ERROR',
        { path: relativePath, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const filePath = join(this.options.baseDir, relativePath);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(relativePath: string): Promise<FileMetadata | null> {
    const filePath = join(this.options.baseDir, relativePath);
    
    try {
      const stats = await fs.stat(filePath);
      const checksum = await this.calculateChecksum(filePath);
      
      return {
        path: relativePath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        checksum,
        compressed: extname(filePath) === '.gz'
      };
    } catch (error) {
      return null;
    }
  }

  async compressFile(relativePath: string): Promise<string> {
    const sourcePath = join(this.options.baseDir, relativePath);
    const targetPath = `${sourcePath}.gz`;
    const targetRelativePath = `${relativePath}.gz`;
    
    return this.withLock(sourcePath, async () => {
      try {
        await pipeline(
          createReadStream(sourcePath),
          createGzip(),
          createWriteStream(targetPath)
        );
        
        await fs.unlink(sourcePath);
        await this.updateIndex(dirname(relativePath));
        
        logger.debug('File compressed', { original: relativePath, compressed: targetRelativePath });
        return targetRelativePath;
      } catch (error) {
        throw new ServiceError(
          `Failed to compress file: ${relativePath}`,
          'FILESYSTEM_COMPRESS_ERROR',
          { path: relativePath, error: error instanceof Error ? error.message : String(error) }
        );
      }
    });
  }

  async decompressFile(relativePath: string): Promise<string> {
    const sourcePath = join(this.options.baseDir, relativePath);
    const targetPath = sourcePath.replace(/\.gz$/, '');
    const targetRelativePath = relativePath.replace(/\.gz$/, '');
    
    return this.withLock(sourcePath, async () => {
      try {
        await pipeline(
          createReadStream(sourcePath),
          createGunzip(),
          createWriteStream(targetPath)
        );
        
        await fs.unlink(sourcePath);
        await this.updateIndex(dirname(relativePath));
        
        logger.debug('File decompressed', { compressed: relativePath, original: targetRelativePath });
        return targetRelativePath;
      } catch (error) {
        throw new ServiceError(
          `Failed to decompress file: ${relativePath}`,
          'FILESYSTEM_DECOMPRESS_ERROR',
          { path: relativePath, error: error instanceof Error ? error.message : String(error) }
        );
      }
    });
  }

  async cleanup(): Promise<void> {
    try {
      // Clean up old backups
      await this.cleanupBackups();
      
      // Clean up temp files
      const tempDir = join(this.options.baseDir, 'temp');
      const tempFiles = await fs.readdir(tempDir);
      
      for (const file of tempFiles) {
        const filePath = join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        // Delete temp files older than 1 hour
        if (Date.now() - stats.mtime.getTime() > 3600000) {
          await fs.unlink(filePath);
        }
      }
      
      logger.info('FileSystem cleanup completed');
    } catch (error) {
      logger.warn('FileSystem cleanup failed', { error });
    }
  }

  private async withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = filePath;
    
    // Wait for existing lock if any
    while (this.locks.has(lockKey)) {
      await this.locks.get(lockKey);
    }
    
    // Create new lock
    const lockPromise = new Promise<void>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ServiceError(
          'File lock timeout',
          'FILESYSTEM_LOCK_TIMEOUT',
          { path: filePath, timeout: this.options.lockTimeout }
        ));
      }, this.options.lockTimeout);
      
      try {
        const result = await operation();
        clearTimeout(timeout);
        resolve();
        return result;
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
    
    this.locks.set(lockKey, lockPromise);
    
    try {
      const result = await operation();
      this.locks.delete(lockKey);
      return result;
    } catch (error) {
      this.locks.delete(lockKey);
      throw error;
    }
  }

  private async atomicWrite(filePath: string, content: string, compress: boolean): Promise<void> {
    const tempPath = join(this.options.baseDir, 'temp', `${basename(filePath)}.tmp.${Date.now()}`);
    
    try {
      if (compress) {
        await pipeline(
          async function* () { yield content; },
          createGzip(),
          createWriteStream(tempPath)
        );
      } else {
        await fs.writeFile(tempPath, content, 'utf-8');
      }
      
      await fs.rename(tempPath, compress ? `${filePath}.gz` : filePath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw error;
    }
  }

  private async directWrite(filePath: string, content: string, compress: boolean): Promise<void> {
    if (compress) {
      await pipeline(
        async function* () { yield content; },
        createGzip(),
        createWriteStream(`${filePath}.gz`)
      );
    } else {
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }

  private async readCompressedFile(filePath: string): Promise<string> {
    let content = '';
    
    await pipeline(
      createReadStream(filePath),
      createGunzip(),
      async function* (source) {
        for await (const chunk of source) {
          content += chunk.toString();
        }
      }
    );
    
    return content;
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private async createBackup(filePath: string): Promise<void> {
    const backupDir = join(this.options.baseDir, 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${basename(filePath)}.${timestamp}.backup`;
    const backupPath = join(backupDir, backupName);
    
    await fs.copyFile(filePath, backupPath);
  }

  private async cleanupBackups(): Promise<void> {
    const backupDir = join(this.options.baseDir, 'backups');
    
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.endsWith('.backup'))
        .map(file => ({ name: file, path: join(backupDir, file) }));
      
      if (backupFiles.length <= this.options.maxBackups) {
        return;
      }
      
      // Sort by creation time and delete oldest
      const stats = await Promise.all(
        backupFiles.map(async file => ({
          ...file,
          stats: await fs.stat(file.path)
        }))
      );
      
      stats.sort((a, b) => a.stats.birthtime.getTime() - b.stats.birthtime.getTime());
      
      const filesToDelete = stats.slice(0, stats.length - this.options.maxBackups);
      
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
      }
    } catch (error) {
      logger.warn('Failed to cleanup backups', { error });
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const { createHash } = await import('crypto');
    const hash = createHash('sha256');
    
    await pipeline(
      createReadStream(filePath),
      hash
    );
    
    return hash.digest('hex');
  }

  private async rebuildIndexes(): Promise<void> {
    // Implementation for rebuilding directory indexes
    logger.info('Rebuilding file system indexes');
  }

  private async getOrCreateIndex(relativePath: string): Promise<DirectoryIndex> {
    if (!this.indexes.has(relativePath)) {
      await this.updateIndex(relativePath);
    }
    return this.indexes.get(relativePath)!;
  }

  private async updateIndex(relativePath: string): Promise<void> {
    const dirPath = join(this.options.baseDir, relativePath);
    
    try {
      const files = await fs.readdir(dirPath);
      const fileMetadataMap = new Map<string, FileMetadata>();
      let totalSize = 0;
      
      for (const file of files) {
        const filePath = join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          const metadata: FileMetadata = {
            path: join(relativePath, file),
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            checksum: await this.calculateChecksum(filePath),
            compressed: extname(file) === '.gz'
          };
          
          fileMetadataMap.set(file, metadata);
          totalSize += stats.size;
        }
      }
      
      const index: DirectoryIndex = {
        files: fileMetadataMap,
        lastUpdated: new Date(),
        totalSize,
        fileCount: fileMetadataMap.size
      };
      
      this.indexes.set(relativePath, index);
    } catch (error) {
      logger.warn('Failed to update directory index', { path: relativePath, error });
    }
  }
}

// Singleton instance
export const fileSystem = new FileSystemManager();