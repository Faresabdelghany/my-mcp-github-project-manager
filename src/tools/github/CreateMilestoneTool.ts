import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { CreateMilestoneSchema, type CreateMilestoneRequest } from '@/domain/schemas/milestone.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for creating new GitHub milestones with comprehensive configuration
 */
export class CreateMilestoneTool extends BaseTool<CreateMilestoneRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'create_milestone',
    description: 'Create a new milestone',
    category: 'github',
    subcategory: 'milestones',
    functionType: 'create',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = CreateMilestoneSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('CreateMilestoneTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: CreateMilestoneRequest): Promise<ToolResult> {
    try {
      this.logger.info('Creating GitHub milestone', { title: args.title });

      // Prepare milestone creation request
      const milestoneRequest = {
        title: args.title,
        description: args.description,
        due_on: args.dueDate,
        state: 'open' as const
      };

      // Create the milestone using GitHub API
      const milestone = await this.githubClient.createMilestone(milestoneRequest);

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
            openIssues: milestone.open_issues || 0,
            closedIssues: milestone.closed_issues || 0
          },
          metadata: {
            createdBy: 'GitHub Project Manager MCP',
            timestamp: new Date().toISOString()
          }
        },
        message: `Successfully created milestone '${args.title}'`
      };

      this.logger.info('Milestone created successfully', { 
        milestoneNumber: milestone.number, 
        title: args.title 
      });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to create milestone', { error, args });
      return this.createErrorResponse(
        `Failed to create milestone '${args.title}': ${error}`,
        'MILESTONE_CREATION_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
