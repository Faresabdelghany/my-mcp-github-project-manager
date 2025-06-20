import { getRESTClient, RESTClient, PaginatedResponse } from '../RESTClient.js';
import { logger } from '@/utils/logger.js';
import { GitHubAPIError, ValidationError } from '@/utils/errors.js';
import { cache } from '@/infrastructure/persistence/Cache.js';

export interface IssueData {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  locked: boolean;
  assignees: Array<{
    id: number;
    login: string;
    avatar_url: string;
  }>;
  labels: Array<{
    id: number;
    name: string;
    color: string;
    description?: string;
  }>;
  milestone?: {
    id: number;
    number: number;
    title: string;
    description?: string;
    state: 'open' | 'closed';
    due_on?: string;
  };
  user: {
    id: number;
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  closed_at?: string;
  closed_by?: {
    id: number;
    login: string;
  };
  html_url: string;
  comments: number;
  reactions: {
    total_count: number;
    '+1': number;
    '-1': number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  };
  timeline_url: string;
  repository_url: string;
}

export interface CreateIssueRequest {
  title: string;
  body?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface UpdateIssueRequest {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  assignees?: string[];
  labels?: string[];
  milestone?: number | null;
}

export interface IssueFilters {
  state?: 'open' | 'closed' | 'all';
  assignee?: string | 'none' | '*';
  creator?: string;
  mentioned?: string;
  labels?: string; // Comma-separated list
  milestone?: string | 'none' | '*';
  since?: string; // ISO 8601 timestamp
  sort?: 'created' | 'updated' | 'comments';
  direction?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface IssueSearchFilters extends IssueFilters {
  q: string; // Search query
  order?: 'asc' | 'desc';
}

export interface IssueComment {
  id: number;
  user: {
    id: number;
    login: string;
    avatar_url: string;
  };
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  issue_url: string;
  author_association: string;
  reactions: {
    total_count: number;
    '+1': number;
    '-1': number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  };
}

export interface IssueEvent {
  id: number;
  event: string;
  actor: {
    id: number;
    login: string;
    avatar_url: string;
  };
  created_at: string;
  label?: {
    name: string;
    color: string;
  };
  assignee?: {
    id: number;
    login: string;
  };
  milestone?: {
    title: string;
  };
  rename?: {
    from: string;
    to: string;
  };
}

export interface BulkIssueOperation {
  issueNumbers: number[];
  operation: 'close' | 'open' | 'assign' | 'unassign' | 'label' | 'unlabel';
  data?: {
    assignees?: string[];
    labels?: string[];
    state_reason?: string;
  };
}

export class IssueRepository {
  private readonly restClient: RESTClient;
  private readonly owner: string;
  private readonly repo: string;

  constructor(owner?: string, repo?: string) {
    this.restClient = getRESTClient();
    // These would typically come from configuration
    this.owner = owner || process.env.GITHUB_DEFAULT_OWNER || 'default-owner';
    this.repo = repo || process.env.GITHUB_DEFAULT_REPO || 'default-repo';
  }

  /**
   * Create a new issue
   */
  async createIssue(data: CreateIssueRequest, owner?: string, repo?: string): Promise<IssueData> {
    try {
      logger.info('Creating issue', { title: data.title, owner: owner || this.owner, repo: repo || this.repo });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues`;
      
      const response = await this.restClient.post<IssueData>(endpoint, {
        title: data.title,
        body: data.body,
        assignees: data.assignees,
        labels: data.labels,
        milestone: data.milestone
      });

      // Cache the created issue
      await cache.set(`issue:${response.id}`, response, 300000);
      await cache.invalidate(`issues:list:${owner || this.owner}:${repo || this.repo}:*`);
      
      logger.info('Issue created successfully', { issueId: response.id, number: response.number });
      
      return response;
    } catch (error) {
      logger.error('Failed to create issue', { error, data });
      throw new GitHubAPIError(
        `Failed to create issue: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_CREATE_ERROR',
        { data, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Get issue by number
   */
  async getIssue(issueNumber: number, owner?: string, repo?: string): Promise<IssueData> {
    try {
      // Try cache first
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      const cached = await cache.get<IssueData>(cacheKey);
      if (cached) {
        return cached;
      }

      logger.debug('Fetching issue', { issueNumber, owner: owner || this.owner, repo: repo || this.repo });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}`;
      const response = await this.restClient.get<IssueData>(endpoint);

      // Cache the issue
      await cache.set(cacheKey, response, 300000);
      
      return response;
    } catch (error) {
      logger.error('Failed to get issue', { error, issueNumber });
      
      if ((error as any).status === 404) {
        throw new GitHubAPIError(`Issue not found: ${issueNumber}`, 'ISSUE_NOT_FOUND');
      }
      
      throw new GitHubAPIError(
        `Failed to get issue: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_GET_ERROR',
        { issueNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Update issue
   */
  async updateIssue(issueNumber: number, data: UpdateIssueRequest, owner?: string, repo?: string): Promise<IssueData> {
    try {
      logger.info('Updating issue', { issueNumber, updates: Object.keys(data) });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}`;
      
      const response = await this.restClient.patch<IssueData>(endpoint, {
        title: data.title,
        body: data.body,
        state: data.state,
        assignees: data.assignees,
        labels: data.labels,
        milestone: data.milestone
      });

      // Update cache
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      await cache.set(cacheKey, response, 300000);
      await cache.invalidate(`issues:list:${owner || this.owner}:${repo || this.repo}:*`);
      
      logger.info('Issue updated successfully', { issueNumber, issueId: response.id });
      
      return response;
    } catch (error) {
      logger.error('Failed to update issue', { error, issueNumber, data });
      throw new GitHubAPIError(
        `Failed to update issue: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_UPDATE_ERROR',
        { issueNumber, data, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * List issues with filters
   */
  async listIssues(filters: IssueFilters = {}, owner?: string, repo?: string): Promise<PaginatedResponse<IssueData>> {
    try {
      logger.debug('Listing issues', { filters, owner: owner || this.owner, repo: repo || this.repo });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues`;
      
      const params = {
        state: filters.state || 'open',
        assignee: filters.assignee,
        creator: filters.creator,
        mentioned: filters.mentioned,
        labels: filters.labels,
        milestone: filters.milestone,
        since: filters.since,
        sort: filters.sort || 'created',
        direction: filters.direction || 'desc',
        per_page: filters.per_page || 30,
        page: filters.page || 1
      };

      // Remove undefined values
      Object.keys(params).forEach(key => {
        if (params[key as keyof typeof params] === undefined) {
          delete params[key as keyof typeof params];
        }
      });

      const response = await this.restClient.paginate<IssueData>(endpoint, params, {
        useCache: true,
        cacheTTL: 120000 // 2 minutes for lists
      });

      return response;
    } catch (error) {
      logger.error('Failed to list issues', { error, filters });
      throw new GitHubAPIError(
        `Failed to list issues: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_LIST_ERROR',
        { filters, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Search issues across repositories
   */
  async searchIssues(filters: IssueSearchFilters): Promise<{ total_count: number; incomplete_results: boolean; items: IssueData[] }> {
    try {
      logger.debug('Searching issues', { query: filters.q });
      
      const endpoint = '/search/issues';
      
      const params = {
        q: filters.q,
        sort: filters.sort || 'updated',
        order: filters.order || 'desc',
        per_page: filters.per_page || 30,
        page: filters.page || 1
      };

      const response = await this.restClient.get<any>(endpoint, params, {
        useCache: true,
        cacheTTL: 60000 // 1 minute for search results
      });

      return {
        total_count: response.total_count,
        incomplete_results: response.incomplete_results,
        items: response.items
      };
    } catch (error) {
      logger.error('Failed to search issues', { error, filters });
      throw new GitHubAPIError(
        `Failed to search issues: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_SEARCH_ERROR',
        { filters }
      );
    }
  }

  /**
   * Get issue comments
   */
  async getIssueComments(issueNumber: number, owner?: string, repo?: string): Promise<IssueComment[]> {
    try {
      logger.debug('Fetching issue comments', { issueNumber });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/comments`;
      
      const response = await this.restClient.paginate<IssueComment>(endpoint, {
        sort: 'created',
        direction: 'asc'
      }, {
        useCache: true,
        cacheTTL: 300000 // 5 minutes
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get issue comments', { error, issueNumber });
      throw new GitHubAPIError(
        `Failed to get issue comments: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_COMMENTS_ERROR',
        { issueNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Create issue comment
   */
  async createIssueComment(issueNumber: number, body: string, owner?: string, repo?: string): Promise<IssueComment> {
    try {
      logger.info('Creating issue comment', { issueNumber });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/comments`;
      
      const response = await this.restClient.post<IssueComment>(endpoint, { body });

      // Invalidate issue cache to reflect updated comment count
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      await cache.invalidate(cacheKey);
      
      logger.info('Issue comment created successfully', { commentId: response.id });
      
      return response;
    } catch (error) {
      logger.error('Failed to create issue comment', { error, issueNumber });
      throw new GitHubAPIError(
        `Failed to create issue comment: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_COMMENT_CREATE_ERROR',
        { issueNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Get issue events
   */
  async getIssueEvents(issueNumber: number, owner?: string, repo?: string): Promise<IssueEvent[]> {
    try {
      logger.debug('Fetching issue events', { issueNumber });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/events`;
      
      const response = await this.restClient.paginate<IssueEvent>(endpoint, {}, {
        useCache: true,
        cacheTTL: 300000 // 5 minutes
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get issue events', { error, issueNumber });
      throw new GitHubAPIError(
        `Failed to get issue events: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_EVENTS_ERROR',
        { issueNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Add assignees to issue
   */
  async addAssignees(issueNumber: number, assignees: string[], owner?: string, repo?: string): Promise<IssueData> {
    try {
      logger.info('Adding assignees to issue', { issueNumber, assignees });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/assignees`;
      
      const response = await this.restClient.post<IssueData>(endpoint, { assignees });

      // Update cache
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      await cache.set(cacheKey, response, 300000);
      
      logger.info('Assignees added successfully', { issueNumber });
      
      return response;
    } catch (error) {
      logger.error('Failed to add assignees', { error, issueNumber, assignees });
      throw new GitHubAPIError(
        `Failed to add assignees: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_ADD_ASSIGNEES_ERROR',
        { issueNumber, assignees, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Remove assignees from issue
   */
  async removeAssignees(issueNumber: number, assignees: string[], owner?: string, repo?: string): Promise<IssueData> {
    try {
      logger.info('Removing assignees from issue', { issueNumber, assignees });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/assignees`;
      
      const response = await this.restClient.delete<IssueData>(endpoint, {
        data: { assignees }
      } as any);

      // Update cache
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      await cache.set(cacheKey, response, 300000);
      
      logger.info('Assignees removed successfully', { issueNumber });
      
      return response;
    } catch (error) {
      logger.error('Failed to remove assignees', { error, issueNumber, assignees });
      throw new GitHubAPIError(
        `Failed to remove assignees: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_REMOVE_ASSIGNEES_ERROR',
        { issueNumber, assignees, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Add labels to issue
   */
  async addLabels(issueNumber: number, labels: string[], owner?: string, repo?: string): Promise<IssueData['labels']> {
    try {
      logger.info('Adding labels to issue', { issueNumber, labels });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/labels`;
      
      const response = await this.restClient.post<IssueData['labels']>(endpoint, { labels });

      // Invalidate issue cache
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      await cache.invalidate(cacheKey);
      
      logger.info('Labels added successfully', { issueNumber });
      
      return response;
    } catch (error) {
      logger.error('Failed to add labels', { error, issueNumber, labels });
      throw new GitHubAPIError(
        `Failed to add labels: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_ADD_LABELS_ERROR',
        { issueNumber, labels, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Remove labels from issue
   */
  async removeLabel(issueNumber: number, label: string, owner?: string, repo?: string): Promise<void> {
    try {
      logger.info('Removing label from issue', { issueNumber, label });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`;
      
      await this.restClient.delete(endpoint);

      // Invalidate issue cache
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      await cache.invalidate(cacheKey);
      
      logger.info('Label removed successfully', { issueNumber, label });
    } catch (error) {
      logger.error('Failed to remove label', { error, issueNumber, label });
      throw new GitHubAPIError(
        `Failed to remove label: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_REMOVE_LABEL_ERROR',
        { issueNumber, label, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Lock an issue
   */
  async lockIssue(issueNumber: number, lockReason?: 'off-topic' | 'too heated' | 'resolved' | 'spam', owner?: string, repo?: string): Promise<void> {
    try {
      logger.info('Locking issue', { issueNumber, lockReason });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/lock`;
      
      await this.restClient.put(endpoint, {
        lock_reason: lockReason
      });

      // Invalidate issue cache
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      await cache.invalidate(cacheKey);
      
      logger.info('Issue locked successfully', { issueNumber });
    } catch (error) {
      logger.error('Failed to lock issue', { error, issueNumber });
      throw new GitHubAPIError(
        `Failed to lock issue: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_LOCK_ERROR',
        { issueNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Unlock an issue
   */
  async unlockIssue(issueNumber: number, owner?: string, repo?: string): Promise<void> {
    try {
      logger.info('Unlocking issue', { issueNumber });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues/${issueNumber}/lock`;
      
      await this.restClient.delete(endpoint);

      // Invalidate issue cache
      const cacheKey = `issue:${owner || this.owner}:${repo || this.repo}:${issueNumber}`;
      await cache.invalidate(cacheKey);
      
      logger.info('Issue unlocked successfully', { issueNumber });
    } catch (error) {
      logger.error('Failed to unlock issue', { error, issueNumber });
      throw new GitHubAPIError(
        `Failed to unlock issue: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_UNLOCK_ERROR',
        { issueNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Perform bulk operations on multiple issues
   */
  async bulkOperation(operation: BulkIssueOperation, owner?: string, repo?: string): Promise<{ success: number[]; failed: Array<{ issueNumber: number; error: string }> }> {
    try {
      logger.info('Performing bulk issue operation', { 
        operation: operation.operation, 
        count: operation.issueNumbers.length 
      });
      
      const results = {
        success: [] as number[],
        failed: [] as Array<{ issueNumber: number; error: string }>
      };

      // Process issues in parallel with concurrency limit
      const concurrency = 5;
      const chunks = [];
      for (let i = 0; i < operation.issueNumbers.length; i += concurrency) {
        chunks.push(operation.issueNumbers.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        const promises = chunk.map(async (issueNumber) => {
          try {
            switch (operation.operation) {
              case 'close':
                await this.updateIssue(issueNumber, { state: 'closed' }, owner, repo);
                break;
              case 'open':
                await this.updateIssue(issueNumber, { state: 'open' }, owner, repo);
                break;
              case 'assign':
                if (operation.data?.assignees) {
                  await this.addAssignees(issueNumber, operation.data.assignees, owner, repo);
                }
                break;
              case 'unassign':
                if (operation.data?.assignees) {
                  await this.removeAssignees(issueNumber, operation.data.assignees, owner, repo);
                }
                break;
              case 'label':
                if (operation.data?.labels) {
                  await this.addLabels(issueNumber, operation.data.labels, owner, repo);
                }
                break;
              case 'unlabel':
                if (operation.data?.labels) {
                  for (const label of operation.data.labels) {
                    await this.removeLabel(issueNumber, label, owner, repo);
                  }
                }
                break;
            }
            results.success.push(issueNumber);
          } catch (error) {
            results.failed.push({
              issueNumber,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        });

        await Promise.allSettled(promises);
      }

      logger.info('Bulk operation completed', { 
        operation: operation.operation,
        success: results.success.length,
        failed: results.failed.length
      });

      return results;
    } catch (error) {
      logger.error('Failed to perform bulk operation', { error, operation });
      throw new GitHubAPIError(
        `Failed to perform bulk operation: ${error instanceof Error ? error.message : String(error)}`,
        'ISSUE_BULK_OPERATION_ERROR',
        { operation, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }
}

// Singleton instance
let issueRepositoryInstance: IssueRepository | null = null;

export function getIssueRepository(owner?: string, repo?: string): IssueRepository {
  if (!issueRepositoryInstance) {
    issueRepositoryInstance = new IssueRepository(owner, repo);
  }
  return issueRepositoryInstance;
}