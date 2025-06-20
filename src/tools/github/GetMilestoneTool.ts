import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { GetMilestoneSchema, type GetMilestoneRequest } from '@/domain/schemas/milestone.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for retrieving detailed information about a specific GitHub milestone
 */
export class GetMilestoneTool extends BaseTool<GetMilestoneRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'get_milestone',
    description: 'Get details of a specific milestone',
    category: 'github',
    subcategory: 'milestones',
    functionType: 'read',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = GetMilestoneSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('GetMilestoneTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: GetMilestoneRequest): Promise<ToolResult> {
    try {
      this.logger.info('Getting GitHub milestone details', { milestoneId: args.milestoneId });

      // Parse milestone number from ID
      const milestoneNumber = parseInt(args.milestoneId);
      if (isNaN(milestoneNumber)) {
        throw new Error('Invalid milestone ID format. Expected a number.');
      }

      // Get milestone from GitHub API
      const milestone = await this.githubClient.getMilestone(milestoneNumber);

      // Calculate progress metrics
      const totalIssues = (milestone.open_issues || 0) + (milestone.closed_issues || 0);
      const completedIssues = milestone.closed_issues || 0;
      const progressPercentage = totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;

      // Calculate time metrics
      const now = new Date();
      const dueDate = milestone.due_on ? new Date(milestone.due_on) : null;
      const isOverdue = dueDate ? now > dueDate && milestone.state === 'open' : false;
      const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

      const response = {
        success: true,
        data: {
          milestone: {
            id: milestone.id,
            number: milestone.number,
            title: milestone.title,
            description: milestone.description,
            state: milestone.state,
            dueDate: milestone.due_on,
            url: milestone.html_url,
            createdAt: milestone.created_at,
            updatedAt: milestone.updated_at,
            closedAt: milestone.closed_at,
            openIssues: milestone.open_issues || 0,
            closedIssues: milestone.closed_issues || 0
          },
          progress: {
            total: totalIssues,
            completed: completedIssues,
            remaining: milestone.open_issues || 0,
            percentage: progressPercentage
          },
          timeline: {
            isOverdue,
            daysUntilDue,
            dueDate: milestone.due_on,
            status: milestone.state === 'closed' ? 'completed' :
                   isOverdue ? 'overdue' :
                   daysUntilDue !== null && daysUntilDue <= 7 ? 'due_soon' : 'on_track'
          },
          metadata: {
            milestoneId: args.milestoneId,
            milestoneNumber: milestone.number,
            retrievedAt: new Date().toISOString()
          }
        },
        message: `Retrieved milestone #${milestone.number}: '${milestone.title}' (${progressPercentage}% complete)`
      };

      this.logger.info('Milestone retrieved successfully', { 
        milestoneNumber: milestone.number, 
        title: milestone.title,
        progress: progressPercentage
      });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to get milestone', { error, args });
      return this.createErrorResponse(
        `Failed to get milestone '${args.milestoneId}': ${error}`,
        'MILESTONE_GET_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
