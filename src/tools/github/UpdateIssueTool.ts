import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { UpdateIssueSchema, type UpdateIssueRequest } from '@/domain/schemas/issue.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for updating GitHub issue properties
 */
export class UpdateIssueTool extends BaseTool<UpdateIssueRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'update_issue',
    description: 'Update an existing GitHub issue',
    category: 'github',
    subcategory: 'issues',
    functionType: 'update',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = UpdateIssueSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('UpdateIssueTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: UpdateIssueRequest): Promise<ToolResult> {
    try {
      this.logger.info('Updating GitHub issue', { issueId: args.issueId });

      // Parse issue number from ID
      const issueNumber = parseInt(args.issueId);
      if (isNaN(issueNumber)) {
        throw new Error('Invalid issue ID format. Expected a number.');
      }

      // Get current issue to compare changes
      const currentIssue = await this.githubClient.getIssue(issueNumber);

      // Track what we're updating
      const changes: string[] = [];
      const updateRequest: any = {};

      if (args.title && args.title !== currentIssue.title) {
        updateRequest.title = args.title;
        changes.push('title updated');
      }

      if (args.description !== undefined && args.description !== currentIssue.body) {
        updateRequest.body = args.description;
        changes.push('description updated');
      }

      if (args.status && args.status !== currentIssue.state) {
        updateRequest.state = args.status;
        changes.push(`status changed to ${args.status}`);
      }

      if (args.assignees) {
        updateRequest.assignees = args.assignees;
        changes.push('assignees updated');
      }

      if (args.labels) {
        updateRequest.labels = args.labels;
        changes.push('labels updated');
      }

      if (args.milestoneId) {
        const milestoneNumber = parseInt(args.milestoneId);
        if (!isNaN(milestoneNumber)) {
          updateRequest.milestone = milestoneNumber;
          changes.push('milestone updated');
        }
      }

      // Only update if there are changes
      if (changes.length === 0) {
        return this.createSuccessResponse({
          success: true,
          data: {
            issue: {
              id: currentIssue.id,
              number: currentIssue.number,
              title: currentIssue.title,
              description: currentIssue.body,
              state: currentIssue.state
            },
            changes: [],
            metadata: {
              issueId: args.issueId,
              noChangesDetected: true
            }
          },
          message: `No changes detected for issue #${issueNumber}`
        });
      }

      // Update the issue
      const updatedIssue = await this.githubClient.updateIssue(issueNumber, updateRequest);

      const response = {
        success: true,
        data: {
          issue: {
            id: updatedIssue.id,
            number: updatedIssue.number,
            title: updatedIssue.title,
            description: updatedIssue.body,
            state: updatedIssue.state,
            assignees: updatedIssue.assignees?.map(a => a.login) || [],
            labels: updatedIssue.labels?.map(l => typeof l === 'string' ? l : l.name) || [],
            milestone: updatedIssue.milestone?.title,
            url: updatedIssue.html_url,
            updatedAt: updatedIssue.updated_at
          },
          changes,
          metadata: {
            issueId: args.issueId,
            issueNumber: updatedIssue.number,
            updatedFields: changes,
            milestoneId: args.milestoneId,
            updatedAt: new Date().toISOString()
          }
        },
        message: `Successfully updated issue #${updatedIssue.number}. Changes: ${changes.join(', ')}`
      };

      this.logger.info('Issue updated successfully', { issueNumber: updatedIssue.number, changes });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to update issue', { error, args });
      return this.createErrorResponse(
        `Failed to update issue '${args.issueId}': ${error}`,
        'ISSUE_UPDATE_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
