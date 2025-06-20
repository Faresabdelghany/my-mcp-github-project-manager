import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { ListIssuesSchema, type ListIssuesRequest } from '@/domain/schemas/issue.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for listing GitHub issues with filtering and pagination
 */
export class ListIssuesTool extends BaseTool<ListIssuesRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'list_issues',
    description: 'List GitHub issues',
    category: 'github',
    subcategory: 'issues',
    functionType: 'read',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = ListIssuesSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('ListIssuesTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: ListIssuesRequest): Promise<ToolResult> {
    try {
      this.logger.info('Listing GitHub issues', { 
        status: args.status, 
        assignee: args.assignee,
        limit: args.limit 
      });

      // Prepare filter options
      const options = {
        state: args.status,
        assignee: args.assignee,
        labels: args.labels?.join(','),
        milestone: args.milestone,
        sort: args.sort,
        direction: args.direction,
        per_page: args.limit
      };

      // Get issues from GitHub API
      const issuesResponse = await this.githubClient.listIssues(options);

      const response = {
        success: true,
        data: {
          issues: issuesResponse.data.map(issue => ({
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
            updatedAt: issue.updated_at,
            user: issue.user?.login
          })),
          pagination: issuesResponse.pagination,
          metadata: {
            filters: {
              status: args.status,
              assignee: args.assignee,
              labels: args.labels,
              milestone: args.milestone
            },
            sorting: {
              sort: args.sort,
              direction: args.direction
            },
            totalRetrieved: issuesResponse.data.length,
            retrievedAt: new Date().toISOString()
          }
        },
        message: `Found ${issuesResponse.data.length} issues matching the criteria`
      };

      this.logger.info('Issues listed successfully', { count: issuesResponse.data.length });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to list issues', { error, args });
      return this.createErrorResponse(
        `Failed to list issues: ${error}`,
        'ISSUE_LIST_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
