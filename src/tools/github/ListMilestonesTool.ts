import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { ListMilestonesSchema, type ListMilestonesRequest } from '@/domain/schemas/milestone.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for listing GitHub milestones with filtering and pagination
 */
export class ListMilestonesTool extends BaseTool<ListMilestonesRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'list_milestones',
    description: 'List all milestones',
    category: 'github',
    subcategory: 'milestones',
    functionType: 'read',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = ListMilestonesSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('ListMilestonesTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: ListMilestonesRequest): Promise<ToolResult> {
    try {
      this.logger.info('Listing GitHub milestones', { 
        status: args.status,
        sort: args.sort,
        direction: args.direction
      });

      // Prepare filter options
      const options = {
        state: args.status,
        sort: args.sort,
        direction: args.direction
      };

      // Get milestones from GitHub API
      const milestonesResponse = await this.githubClient.listMilestones(options);

      const response = {
        success: true,
        data: {
          milestones: milestonesResponse.data.map(milestone => ({
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
            closedIssues: milestone.closed_issues || 0,
            progress: {
              total: (milestone.open_issues || 0) + (milestone.closed_issues || 0),
              completed: milestone.closed_issues || 0,
              percentage: milestone.open_issues || milestone.closed_issues ? 
                Math.round(((milestone.closed_issues || 0) / 
                ((milestone.open_issues || 0) + (milestone.closed_issues || 0))) * 100) : 0
            }
          })),
          pagination: milestonesResponse.pagination,
          metadata: {
            filters: {
              status: args.status,
              sort: args.sort,
              direction: args.direction
            },
            totalRetrieved: milestonesResponse.data.length,
            retrievedAt: new Date().toISOString()
          }
        },
        message: `Found ${milestonesResponse.data.length} milestones with status '${args.status}'`
      };

      this.logger.info('Milestones listed successfully', { count: milestonesResponse.data.length });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to list milestones', { error, args });
      return this.createErrorResponse(
        `Failed to list milestones: ${error}`,
        'MILESTONE_LIST_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
