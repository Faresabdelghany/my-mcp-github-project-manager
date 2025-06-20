import { getRESTClient, RESTClient, PaginatedResponse } from '../RESTClient.js';
import { logger } from '@/utils/logger.js';
import { GitHubAPIError, ValidationError } from '@/utils/errors.js';
import { cache } from '@/infrastructure/persistence/Cache.js';

export interface MilestoneData {
  id: number;
  number: number;
  title: string;
  description?: string;
  state: 'open' | 'closed';
  creator: {
    id: number;
    login: string;
    avatar_url: string;
  };
  open_issues: number;
  closed_issues: number;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  due_on?: string;
  html_url: string;
  labels_url: string;
  node_id: string;
  url: string;
}

export interface CreateMilestoneRequest {
  title: string;
  description?: string;
  due_on?: string; // ISO 8601 date
  state?: 'open' | 'closed';
}

export interface UpdateMilestoneRequest {
  title?: string;
  description?: string;
  due_on?: string | null; // ISO 8601 date, null to remove
  state?: 'open' | 'closed';
}

export interface MilestoneFilters {
  state?: 'open' | 'closed' | 'all';
  sort?: 'due_on' | 'completeness';
  direction?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface MilestoneSearchFilters extends MilestoneFilters {
  q: string; // Search query
  order?: 'asc' | 'desc';
}

export interface MilestoneProgress {
  milestoneId: number;
  title: string;
  totalIssues: number;
  openIssues: number;
  closedIssues: number;
  completionPercentage: number;
  timeToDeadline?: {
    days: number;
    isOverdue: boolean;
  };
  velocity: {
    issuesPerDay: number;
    estimatedCompletionDate?: string;
  };
  recentActivity: {
    issuesOpenedLastWeek: number;
    issuesClosedLastWeek: number;
    trend: 'improving' | 'declining' | 'stable';
  };
}

export interface MilestoneMetrics {
  milestoneId: number;
  metrics: {
    averageTimeToClose: number; // in hours
    totalTimeSpent: number; // in hours
    burndownRate: number; // issues per day
    scopeChanges: number; // issues added/removed after creation
  };
  timeline: {
    created: string;
    firstIssueAssigned: string;
    lastActivity: string;
    estimatedCompletion: string;
    actualCompletion?: string;
  };
  teamContribution: {
    assignee: string;
    issuesAssigned: number;
    issuesCompleted: number;
    completionRate: number;
  }[];
}

export interface BulkMilestoneOperation {
  milestoneNumbers: number[];
  operation: 'close' | 'open' | 'update_due_date' | 'delete';
  data?: {
    state?: 'open' | 'closed';
    due_on?: string;
    description?: string;
  };
}

export class MilestoneRepository {
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
   * Create a new milestone
   */
  async createMilestone(data: CreateMilestoneRequest, owner?: string, repo?: string): Promise<MilestoneData> {
    try {
      logger.info('Creating milestone', { title: data.title, owner: owner || this.owner, repo: repo || this.repo });
      
      // Validate due date format if provided
      if (data.due_on && !this.isValidISODate(data.due_on)) {
        throw new ValidationError('due_on must be a valid ISO 8601 date string');
      }
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/milestones`;
      
      const response = await this.restClient.post<MilestoneData>(endpoint, {
        title: data.title,
        description: data.description,
        due_on: data.due_on,
        state: data.state || 'open'
      });

      // Cache the created milestone
      await cache.set(`milestone:${response.id}`, response, 300000);
      await cache.invalidate(`milestones:list:${owner || this.owner}:${repo || this.repo}:*`);
      
      logger.info('Milestone created successfully', { milestoneId: response.id, number: response.number });
      
      return response;
    } catch (error) {
      logger.error('Failed to create milestone', { error, data });
      
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new GitHubAPIError(
        `Failed to create milestone: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_CREATE_ERROR',
        { data, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Get milestone by number
   */
  async getMilestone(milestoneNumber: number, owner?: string, repo?: string): Promise<MilestoneData> {
    try {
      // Try cache first
      const cacheKey = `milestone:${owner || this.owner}:${repo || this.repo}:${milestoneNumber}`;
      const cached = await cache.get<MilestoneData>(cacheKey);
      if (cached) {
        return cached;
      }

      logger.debug('Fetching milestone', { milestoneNumber, owner: owner || this.owner, repo: repo || this.repo });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/milestones/${milestoneNumber}`;
      const response = await this.restClient.get<MilestoneData>(endpoint);

      // Cache the milestone
      await cache.set(cacheKey, response, 300000);
      
      return response;
    } catch (error) {
      logger.error('Failed to get milestone', { error, milestoneNumber });
      
      if ((error as any).status === 404) {
        throw new GitHubAPIError(`Milestone not found: ${milestoneNumber}`, 'MILESTONE_NOT_FOUND');
      }
      
      throw new GitHubAPIError(
        `Failed to get milestone: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_GET_ERROR',
        { milestoneNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Update milestone
   */
  async updateMilestone(milestoneNumber: number, data: UpdateMilestoneRequest, owner?: string, repo?: string): Promise<MilestoneData> {
    try {
      logger.info('Updating milestone', { milestoneNumber, updates: Object.keys(data) });
      
      // Validate due date format if provided
      if (data.due_on && data.due_on !== null && !this.isValidISODate(data.due_on)) {
        throw new ValidationError('due_on must be a valid ISO 8601 date string or null');
      }
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/milestones/${milestoneNumber}`;
      
      const updatePayload: any = {};
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.due_on !== undefined) updatePayload.due_on = data.due_on;
      if (data.state !== undefined) updatePayload.state = data.state;
      
      const response = await this.restClient.patch<MilestoneData>(endpoint, updatePayload);

      // Update cache
      const cacheKey = `milestone:${owner || this.owner}:${repo || this.repo}:${milestoneNumber}`;
      await cache.set(cacheKey, response, 300000);
      await cache.invalidate(`milestones:list:${owner || this.owner}:${repo || this.repo}:*`);
      
      logger.info('Milestone updated successfully', { milestoneNumber, milestoneId: response.id });
      
      return response;
    } catch (error) {
      logger.error('Failed to update milestone', { error, milestoneNumber, data });
      
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new GitHubAPIError(
        `Failed to update milestone: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_UPDATE_ERROR',
        { milestoneNumber, data, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Delete milestone
   */
  async deleteMilestone(milestoneNumber: number, owner?: string, repo?: string): Promise<void> {
    try {
      logger.info('Deleting milestone', { milestoneNumber });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/milestones/${milestoneNumber}`;
      
      await this.restClient.delete(endpoint);

      // Clear cache
      const cacheKey = `milestone:${owner || this.owner}:${repo || this.repo}:${milestoneNumber}`;
      await cache.invalidate(cacheKey);
      await cache.invalidate(`milestones:list:${owner || this.owner}:${repo || this.repo}:*`);
      
      logger.info('Milestone deleted successfully', { milestoneNumber });
    } catch (error) {
      logger.error('Failed to delete milestone', { error, milestoneNumber });
      
      if ((error as any).status === 404) {
        throw new GitHubAPIError(`Milestone not found: ${milestoneNumber}`, 'MILESTONE_NOT_FOUND');
      }
      
      throw new GitHubAPIError(
        `Failed to delete milestone: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_DELETE_ERROR',
        { milestoneNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * List milestones with filters
   */
  async listMilestones(filters: MilestoneFilters = {}, owner?: string, repo?: string): Promise<PaginatedResponse<MilestoneData>> {
    try {
      logger.debug('Listing milestones', { filters, owner: owner || this.owner, repo: repo || this.repo });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/milestones`;
      
      const params = {
        state: filters.state || 'open',
        sort: filters.sort || 'due_on',
        direction: filters.direction || 'asc',
        per_page: filters.per_page || 30,
        page: filters.page || 1
      };

      // Remove undefined values
      Object.keys(params).forEach(key => {
        if (params[key as keyof typeof params] === undefined) {
          delete params[key as keyof typeof params];
        }
      });

      const response = await this.restClient.paginate<MilestoneData>(endpoint, params, {
        useCache: true,
        cacheTTL: 120000 // 2 minutes for lists
      });

      return response;
    } catch (error) {
      logger.error('Failed to list milestones', { error, filters });
      throw new GitHubAPIError(
        `Failed to list milestones: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_LIST_ERROR',
        { filters, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Get milestone progress and analytics
   */
  async getMilestoneProgress(milestoneNumber: number, owner?: string, repo?: string): Promise<MilestoneProgress> {
    try {
      logger.debug('Getting milestone progress', { milestoneNumber });
      
      const milestone = await this.getMilestone(milestoneNumber, owner, repo);
      
      const totalIssues = milestone.open_issues + milestone.closed_issues;
      const completionPercentage = totalIssues > 0 ? Math.round((milestone.closed_issues / totalIssues) * 100) : 0;
      
      // Calculate time to deadline
      let timeToDeadline: MilestoneProgress['timeToDeadline'];
      if (milestone.due_on) {
        const dueDate = new Date(milestone.due_on);
        const now = new Date();
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        timeToDeadline = {
          days: Math.abs(diffDays),
          isOverdue: diffDays < 0
        };
      }
      
      // Calculate velocity (simplified - would need issue history for accurate calculation)
      const daysSinceCreation = Math.max(1, Math.ceil((Date.now() - new Date(milestone.created_at).getTime()) / (1000 * 60 * 60 * 24)));
      const issuesPerDay = milestone.closed_issues / daysSinceCreation;
      
      let estimatedCompletionDate: string | undefined;
      if (milestone.open_issues > 0 && issuesPerDay > 0) {
        const daysToComplete = milestone.open_issues / issuesPerDay;
        estimatedCompletionDate = new Date(Date.now() + (daysToComplete * 24 * 60 * 60 * 1000)).toISOString();
      }
      
      // Get recent activity (simplified - would need actual issue history)
      const recentActivity = {
        issuesOpenedLastWeek: 0, // Would need to fetch from issues API
        issuesClosedLastWeek: 0, // Would need to fetch from issues API
        trend: 'stable' as const // Would be calculated from actual data
      };
      
      const progress: MilestoneProgress = {
        milestoneId: milestone.id,
        title: milestone.title,
        totalIssues,
        openIssues: milestone.open_issues,
        closedIssues: milestone.closed_issues,
        completionPercentage,
        timeToDeadline,
        velocity: {
          issuesPerDay,
          estimatedCompletionDate
        },
        recentActivity
      };
      
      return progress;
    } catch (error) {
      logger.error('Failed to get milestone progress', { error, milestoneNumber });
      throw new GitHubAPIError(
        `Failed to get milestone progress: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_PROGRESS_ERROR',
        { milestoneNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Get comprehensive milestone metrics
   */
  async getMilestoneMetrics(milestoneNumber: number, owner?: string, repo?: string): Promise<MilestoneMetrics> {
    try {
      logger.debug('Getting milestone metrics', { milestoneNumber });
      
      const milestone = await this.getMilestone(milestoneNumber, owner, repo);
      
      // This would typically involve fetching and analyzing issue data
      // For now, providing a structure with calculated/estimated values
      
      const metrics: MilestoneMetrics = {
        milestoneId: milestone.id,
        metrics: {
          averageTimeToClose: 0, // Would be calculated from actual issue data
          totalTimeSpent: 0, // Would be calculated from time tracking data
          burndownRate: milestone.closed_issues / Math.max(1, this.daysBetween(milestone.created_at, milestone.closed_at || new Date().toISOString())),
          scopeChanges: 0 // Would be calculated from issue history
        },
        timeline: {
          created: milestone.created_at,
          firstIssueAssigned: milestone.created_at, // Would be actual first assignment
          lastActivity: milestone.updated_at,
          estimatedCompletion: milestone.due_on || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          actualCompletion: milestone.closed_at
        },
        teamContribution: [] // Would be populated from actual assignee data
      };
      
      return metrics;
    } catch (error) {
      logger.error('Failed to get milestone metrics', { error, milestoneNumber });
      throw new GitHubAPIError(
        `Failed to get milestone metrics: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_METRICS_ERROR',
        { milestoneNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Get all issues associated with a milestone
   */
  async getMilestoneIssues(milestoneNumber: number, state: 'open' | 'closed' | 'all' = 'all', owner?: string, repo?: string) {
    try {
      logger.debug('Getting milestone issues', { milestoneNumber, state });
      
      const endpoint = `/repos/${owner || this.owner}/${repo || this.repo}/issues`;
      
      const response = await this.restClient.paginate(endpoint, {
        milestone: milestoneNumber.toString(),
        state,
        sort: 'created',
        direction: 'desc'
      }, {
        useCache: true,
        cacheTTL: 120000
      });
      
      return response;
    } catch (error) {
      logger.error('Failed to get milestone issues', { error, milestoneNumber });
      throw new GitHubAPIError(
        `Failed to get milestone issues: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_ISSUES_ERROR',
        { milestoneNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Get milestone burndown data
   */
  async getMilestoneBurndown(milestoneNumber: number, owner?: string, repo?: string): Promise<{
    dates: string[];
    openIssues: number[];
    closedIssues: number[];
    totalIssues: number[];
    idealBurndown: number[];
  }> {
    try {
      logger.debug('Getting milestone burndown', { milestoneNumber });
      
      const milestone = await this.getMilestone(milestoneNumber, owner, repo);
      
      // This would typically involve fetching historical issue data
      // For now, providing a simplified structure
      
      const startDate = new Date(milestone.created_at);
      const endDate = milestone.due_on ? new Date(milestone.due_on) : new Date();
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const dates: string[] = [];
      const openIssues: number[] = [];
      const closedIssues: number[] = [];
      const totalIssues: number[] = [];
      const idealBurndown: number[] = [];
      
      const currentTotal = milestone.open_issues + milestone.closed_issues;
      
      for (let i = 0; i <= totalDays; i++) {
        const date = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
        dates.push(date.toISOString().split('T')[0]);
        
        // Simplified calculation - would use actual historical data
        const progress = i / totalDays;
        openIssues.push(Math.round(currentTotal * (1 - progress * (milestone.closed_issues / currentTotal))));
        closedIssues.push(Math.round(currentTotal * progress * (milestone.closed_issues / currentTotal)));
        totalIssues.push(currentTotal);
        idealBurndown.push(Math.round(currentTotal * (1 - progress)));
      }
      
      return {
        dates,
        openIssues,
        closedIssues,
        totalIssues,
        idealBurndown
      };
    } catch (error) {
      logger.error('Failed to get milestone burndown', { error, milestoneNumber });
      throw new GitHubAPIError(
        `Failed to get milestone burndown: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_BURNDOWN_ERROR',
        { milestoneNumber, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Perform bulk operations on multiple milestones
   */
  async bulkOperation(operation: BulkMilestoneOperation, owner?: string, repo?: string): Promise<{ success: number[]; failed: Array<{ milestoneNumber: number; error: string }> }> {
    try {
      logger.info('Performing bulk milestone operation', { 
        operation: operation.operation, 
        count: operation.milestoneNumbers.length 
      });
      
      const results = {
        success: [] as number[],
        failed: [] as Array<{ milestoneNumber: number; error: string }>
      };

      // Process milestones in parallel with concurrency limit
      const concurrency = 3; // Lower concurrency for milestones
      const chunks = [];
      for (let i = 0; i < operation.milestoneNumbers.length; i += concurrency) {
        chunks.push(operation.milestoneNumbers.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        const promises = chunk.map(async (milestoneNumber) => {
          try {
            switch (operation.operation) {
              case 'close':
                await this.updateMilestone(milestoneNumber, { state: 'closed' }, owner, repo);
                break;
              case 'open':
                await this.updateMilestone(milestoneNumber, { state: 'open' }, owner, repo);
                break;
              case 'update_due_date':
                if (operation.data?.due_on !== undefined) {
                  await this.updateMilestone(milestoneNumber, { due_on: operation.data.due_on }, owner, repo);
                }
                break;
              case 'delete':
                await this.deleteMilestone(milestoneNumber, owner, repo);
                break;
            }
            results.success.push(milestoneNumber);
          } catch (error) {
            results.failed.push({
              milestoneNumber,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        });

        await Promise.allSettled(promises);
      }

      logger.info('Bulk milestone operation completed', { 
        operation: operation.operation,
        success: results.success.length,
        failed: results.failed.length
      });

      return results;
    } catch (error) {
      logger.error('Failed to perform bulk milestone operation', { error, operation });
      throw new GitHubAPIError(
        `Failed to perform bulk milestone operation: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_BULK_OPERATION_ERROR',
        { operation, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Search milestones across repositories
   */
  async searchMilestones(query: string, owner?: string, repo?: string): Promise<MilestoneData[]> {
    try {
      logger.debug('Searching milestones', { query });
      
      // GitHub doesn't have a direct milestone search API, so we'll list and filter
      const allMilestones = await this.listMilestones({ state: 'all' }, owner, repo);
      
      const searchTerm = query.toLowerCase();
      const filteredMilestones = allMilestones.data.filter(milestone => 
        milestone.title.toLowerCase().includes(searchTerm) ||
        milestone.description?.toLowerCase().includes(searchTerm)
      );
      
      return filteredMilestones;
    } catch (error) {
      logger.error('Failed to search milestones', { error, query });
      throw new GitHubAPIError(
        `Failed to search milestones: ${error instanceof Error ? error.message : String(error)}`,
        'MILESTONE_SEARCH_ERROR',
        { query, owner: owner || this.owner, repo: repo || this.repo }
      );
    }
  }

  /**
   * Validate ISO 8601 date format
   */
  private isValidISODate(dateString: string): boolean {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$|^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRegex.test(dateString)) {
      return false;
    }
    
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Calculate days between two dates
   */
  private daysBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

// Singleton instance
let milestoneRepositoryInstance: MilestoneRepository | null = null;

export function getMilestoneRepository(owner?: string, repo?: string): MilestoneRepository {
  if (!milestoneRepositoryInstance) {
    milestoneRepositoryInstance = new MilestoneRepository(owner, repo);
  }
  return milestoneRepositoryInstance;
}