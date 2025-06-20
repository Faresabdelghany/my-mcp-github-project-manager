import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { ListMilestonesSchema, type ListMilestonesRequest } from '@/domain/schemas/milestone.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';

export class ListMilestonesTool extends BaseTool {
  private githubClient = new GitHubClient();

  readonly metadata: ToolMetadata = {
    name: 'list_milestones',
    description: 'List repository milestones with progress tracking and filtering options',
    inputSchema: ListMilestonesSchema,
    examples: [
      {
        name: 'Open Milestones',
        description: 'Get all open milestones ordered by due date',
        arguments: {
          state: 'open',
          sort: 'due_on',
          direction: 'asc'
        }
      },
      {
        name: 'Completed Milestones',
        description: 'Get closed milestones by completion percentage',
        arguments: {
          state: 'closed',
          sort: 'completeness',
          direction: 'desc',
          perPage: 10
        }
      },
      {
        name: 'All Milestones',
        description: 'Get all milestones with pagination',
        arguments: {
          state: 'all',
          perPage: 50,
          page: 1
        }
      }
    ]
  };

  protected async executeImpl(args: ListMilestonesRequest): Promise<any> {
    try {
      // Fetch milestones from GitHub API
      const milestones = await this.githubClient.listMilestones({
        state: args.state,
        sort: args.sort,
        direction: args.direction,
        per_page: args.perPage,
        page: args.page
      });

      // Calculate current date for time-based calculations
      const now = new Date();

      // Format milestones data for response
      const formattedMilestones = milestones.map(milestone => {
        const totalIssues = milestone.open_issues + milestone.closed_issues;
        const completionPercentage = totalIssues > 0 
          ? Math.round((milestone.closed_issues / totalIssues) * 100)
          : 0;

        const dueDate = milestone.due_on ? new Date(milestone.due_on) : null;
        const timeInfo = dueDate ? {
          daysUntilDue: Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
          isOverdue: dueDate < now,
          formattedDueDate: dueDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        } : null;

        return {
          id: milestone.id,
          number: milestone.number,
          title: milestone.title,
          description: milestone.description,
          state: milestone.state,
          url: milestone.html_url,
          creator: milestone.creator.login,
          createdAt: milestone.created_at,
          updatedAt: milestone.updated_at,
          closedAt: milestone.closed_at,
          dueOn: milestone.due_on,
          progress: {
            openIssues: milestone.open_issues,
            closedIssues: milestone.closed_issues,
            totalIssues,
            completionPercentage
          },
          timeline: timeInfo
        };
      });

      // Generate summary statistics
      const summary = {
        total: formattedMilestones.length,
        byState: formattedMilestones.reduce((acc, milestone) => {
          acc[milestone.state] = (acc[milestone.state] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        totalIssues: formattedMilestones.reduce((sum, m) => sum + m.progress.totalIssues, 0),
        totalOpenIssues: formattedMilestones.reduce((sum, m) => sum + m.progress.openIssues, 0),
        totalClosedIssues: formattedMilestones.reduce((sum, m) => sum + m.progress.closedIssues, 0),
        withDueDates: formattedMilestones.filter(m => m.dueOn).length,
        overdue: formattedMilestones.filter(m => m.timeline?.isOverdue).length,
        averageCompletion: formattedMilestones.length > 0 
          ? Math.round(formattedMilestones.reduce((sum, m) => sum + m.progress.completionPercentage, 0) / formattedMilestones.length)
          : 0
      };

      // Provide insights and recommendations
      const insights = {
        mostActiveLabel: summary.byState.open > summary.byState.closed ? 'open' : 'closed',
        upcomingDeadlines: formattedMilestones
          .filter(m => m.timeline && m.timeline.daysUntilDue <= 7 && m.timeline.daysUntilDue > 0)
          .length,
        completedRecently: formattedMilestones
          .filter(m => m.state === 'closed' && m.closedAt)
          .filter(m => {
            const closedDate = new Date(m.closedAt!);
            const daysSinceClosed = (now.getTime() - closedDate.getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceClosed <= 30;
          }).length,
        needsAttention: formattedMilestones.filter(m => 
          m.state === 'open' && 
          (m.timeline?.isOverdue || (m.timeline?.daysUntilDue !== null && m.timeline.daysUntilDue <= 3))
        ).length
      };

      return this.createSuccessResponse(
        {
          milestones: formattedMilestones,
          summary,
          insights,
          pagination: {
            page: args.page || 1,
            perPage: args.perPage || 30,
            hasMore: formattedMilestones.length === (args.perPage || 30)
          },
          filters: {
            state: args.state,
            sort: args.sort,
            direction: args.direction
          },
          recommendations: insights.needsAttention > 0 ? [
            `${insights.needsAttention} milestone${insights.needsAttention === 1 ? '' : 's'} need immediate attention due to upcoming or overdue deadlines`
          ] : ['All milestones are on track!']
        },
        `Found ${formattedMilestones.length} milestones with ${summary.averageCompletion}% average completion`
      );

    } catch (error) {
      this.logger.error('Failed to list milestones', { error, args });
      throw error;
    }
  }
}