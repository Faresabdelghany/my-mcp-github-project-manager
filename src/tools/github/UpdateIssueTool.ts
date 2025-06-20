import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { UpdateIssueSchema, type UpdateIssueRequest } from '@/domain/schemas/issue.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';

export class UpdateIssueTool extends BaseTool {
  private githubClient = new GitHubClient();

  readonly metadata: ToolMetadata = {
    name: 'update_issue',
    description: 'Update an existing GitHub issue with new information, assignments, and workflow changes',
    inputSchema: UpdateIssueSchema,
    examples: [
      {
        name: 'Close Issue',
        description: 'Mark an issue as closed when completed',
        arguments: {
          issueNumber: 42,
          state: 'closed'
        }
      },
      {
        name: 'Update Assignment',
        description: 'Change issue assignees and add labels',
        arguments: {
          issueNumber: 15,
          assignees: ['developer2', 'designer1'],
          labels: ['in-progress', 'high-priority', 'frontend']
        }
      },
      {
        name: 'Update Description',
        description: 'Modify issue title and description',
        arguments: {
          issueNumber: 23,
          title: 'Implement user authentication with OAuth',
          body: 'Updated requirements: Support Google, GitHub, and Microsoft OAuth providers. Include proper error handling and user profile management.'
        }
      },
      {
        name: 'Set Milestone',
        description: 'Assign issue to a milestone',
        arguments: {
          issueNumber: 8,
          milestone: 5,
          labels: ['sprint-15']
        }
      }
    ]
  };

  protected async executeImpl(args: UpdateIssueRequest): Promise<any> {
    try {
      // Get current issue state for comparison
      const currentIssue = await this.githubClient.getIssue(args.issueNumber);

      // Build update request with only changed fields
      const updateRequest: any = {};
      const changes: string[] = [];

      if (args.title && args.title !== currentIssue.title) {
        updateRequest.title = args.title;
        changes.push(`title updated`);
      }

      if (args.body !== undefined && args.body !== currentIssue.body) {
        updateRequest.body = args.body;
        changes.push('description updated');
      }

      if (args.state && args.state !== currentIssue.state) {
        updateRequest.state = args.state;
        changes.push(`state: ${currentIssue.state} → ${args.state}`);
      }

      if (args.assignees) {
        const currentAssignees = currentIssue.assignees.map(a => a.login).sort();
        const newAssignees = args.assignees.sort();
        if (JSON.stringify(currentAssignees) !== JSON.stringify(newAssignees)) {
          updateRequest.assignees = args.assignees;
          changes.push(`assignees: [${currentAssignees.join(', ')}] → [${newAssignees.join(', ')}]`);
        }
      }

      if (args.labels) {
        const currentLabels = currentIssue.labels.map(l => l.name).sort();
        const newLabels = args.labels.sort();
        if (JSON.stringify(currentLabels) !== JSON.stringify(newLabels)) {
          updateRequest.labels = args.labels;
          changes.push(`labels: [${currentLabels.join(', ')}] → [${newLabels.join(', ')}]`);
        }
      }

      if (args.milestone !== undefined) {
        const currentMilestone = currentIssue.milestone?.number;
        if (currentMilestone !== args.milestone) {
          updateRequest.milestone = args.milestone;
          changes.push(`milestone: ${currentMilestone || 'none'} → ${args.milestone || 'none'}`);
        }
      }

      // Check if there are any changes to apply
      if (Object.keys(updateRequest).length === 0) {
        return this.createSuccessResponse(
          {
            issue: {
              id: currentIssue.id,
              number: currentIssue.number,
              title: currentIssue.title,
              state: currentIssue.state,
              url: currentIssue.html_url,
              assignees: currentIssue.assignees.map(a => a.login),
              labels: currentIssue.labels.map(l => l.name),
              milestone: currentIssue.milestone?.number || null
            },
            changes: []
          },
          'No changes detected - issue is already up to date'
        );
      }

      // Update the issue
      const updatedIssue = await this.githubClient.updateIssue(args.issueNumber, updateRequest);

      return this.createSuccessResponse(
        {
          issue: {
            id: updatedIssue.id,
            number: updatedIssue.number,
            title: updatedIssue.title,
            body: updatedIssue.body,
            state: updatedIssue.state,
            url: updatedIssue.html_url,
            assignees: updatedIssue.assignees.map(a => ({
              login: a.login,
              name: a.name
            })),
            labels: updatedIssue.labels.map(l => ({
              name: l.name,
              color: l.color
            })),
            milestone: updatedIssue.milestone ? {
              number: updatedIssue.milestone.number,
              title: updatedIssue.milestone.title,
              state: updatedIssue.milestone.state
            } : null,
            updatedAt: updatedIssue.updated_at
          },
          changes,
          changesSummary: `Applied ${changes.length} change${changes.length === 1 ? '' : 's'}`
        },
        `Issue #${updatedIssue.number} "${updatedIssue.title}" updated successfully`
      );

    } catch (error) {
      this.logger.error('Failed to update issue', { error, args });
      throw error;
    }
  }
}