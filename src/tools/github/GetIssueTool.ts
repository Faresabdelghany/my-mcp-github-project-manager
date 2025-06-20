import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { GetIssueSchema, type GetIssueRequest } from '@/domain/schemas/issue.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for retrieving detailed information about a specific GitHub issue
 */
export class GetIssueTool extends BaseTool<GetIssueRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'get_issue',
    description: 'Get details of a specific GitHub issue',
    category: 'github',
    subcategory: 'issues',
    functionType: 'read',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = GetIssueSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('GetIssueTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: GetIssueRequest): Promise<ToolResult> {
    try {
      this.logger.info('Getting GitHub issue details', { issueId: args.issueId });

      // Parse issue number from ID (assuming it's the issue number)
      const issueNumber = parseInt(args.issueId);
      if (isNaN(issueNumber)) {
        throw new Error('Invalid issue ID format. Expected a number.');
      }

      // Get issue from GitHub API
      const issue = await this.githubClient.getIssue(issueNumber);

      const response = {
        success: true,
        data: {
          issue: {
            id: issue.id,
            number: issue.number,
            title: issue.title,
            description: issue.body,
            state: issue.state,
            assignees: issue.assignees?.map(a => ({
              login: a.login,
              name: a.name,
              avatar: a.avatar_url
            })) || [],
            labels: issue.labels?.map(l => ({
              name: typeof l === 'string' ? l : l.name,
              color: typeof l === 'object' && l.color ? l.color : undefined,
              description: typeof l === 'object' && l.description ? l.description : undefined
            })) || [],
            milestone: issue.milestone ? {
              title: issue.milestone.title,
              description: issue.milestone.description,
              dueDate: issue.milestone.due_on,
              state: issue.milestone.state
            } : null,
            author: {
              login: issue.user?.login,
              name: issue.user?.name,
              avatar: issue.user?.avatar_url
            },
            url: issue.html_url,
            createdAt: issue.created_at,
            updatedAt: issue.updated_at
          },
          metadata: {
            issueId: args.issueId,
            issueNumber: issue.number,
            retrievedAt: new Date().toISOString()
          }
        },
        message: `Retrieved issue #${issue.number}: '${issue.title}'`
      };

      this.logger.info('Issue retrieved successfully', { issueNumber: issue.number, title: issue.title });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to get issue', { error, args });
      return this.createErrorResponse(
        `Failed to get issue '${args.issueId}': ${error}`,
        'ISSUE_GET_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
