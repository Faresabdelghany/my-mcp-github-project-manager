import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { CreateIssueSchema, type CreateIssueRequest } from '@/domain/schemas/issue.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for creating new GitHub issues with comprehensive configuration
 */
export class CreateIssueTool extends BaseTool<CreateIssueRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'create_issue',
    description: 'Create a new GitHub issue',
    category: 'github',
    subcategory: 'issues',
    functionType: 'create',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = CreateIssueSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('CreateIssueTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: CreateIssueRequest): Promise<ToolResult> {
    try {
      this.logger.info('Creating GitHub issue', { title: args.title });

      // Parse assignees and labels from comma-separated strings
      const assignees = args.assignees.split(',').map(a => a.trim()).filter(a => a);
      const labels = args.labels.split(',').map(l => l.trim()).filter(l => l);

      // Prepare issue creation request
      const issueRequest = {
        title: args.title,
        body: args.description,
        assignees,
        labels,
        milestone: args.milestoneId ? parseInt(args.milestoneId) : undefined
      };

      // Create the issue using GitHub API
      const issue = await this.githubClient.createIssue(issueRequest);

      const response = {
        success: true,
        data: {
          issue: {
            id: issue.id,
            number: issue.number,
            title: issue.title,
            description: issue.body,
            state: issue.state,
            assignees: issue.assignees?.map(a => a.login) || [],
            labels: issue.labels?.map(l => typeof l === 'string' ? l : l.name) || [],
            milestone: issue.milestone?.title,
            url: issue.html_url,
            createdAt: issue.created_at,
            updatedAt: issue.updated_at
          },
          metadata: {
            priority: args.priority,
            type: args.type,
            milestoneId: args.milestoneId,
            createdBy: 'GitHub Project Manager MCP',
            timestamp: new Date().toISOString()
          }
        },
        message: `Successfully created issue #${issue.number}: '${args.title}'`
      };

      this.logger.info('Issue created successfully', { issueNumber: issue.number, title: args.title });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to create issue', { error, args });
      return this.createErrorResponse(
        `Failed to create issue '${args.title}': ${error}`,
        'ISSUE_CREATION_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
