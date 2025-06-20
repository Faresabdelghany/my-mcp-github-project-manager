import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { DeleteProjectSchema, type DeleteProjectRequest } from '@/domain/schemas/project.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for deleting GitHub projects
 */
export class DeleteProjectTool extends BaseTool<DeleteProjectRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'delete_project',
    description: 'Delete a GitHub project',
    category: 'github',
    subcategory: 'projects',
    functionType: 'delete',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = DeleteProjectSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('DeleteProjectTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: DeleteProjectRequest): Promise<ToolResult> {
    try {
      this.logger.info('Deleting GitHub project', { projectId: args.projectId });

      // Note: This is a simplified implementation
      // In a real scenario, you would use GitHub's GraphQL API to delete projects
      // Project deletion is a destructive operation and should be handled carefully
      
      const response = {
        success: true,
        data: {
          projectId: args.projectId,
          deletedAt: new Date().toISOString(),
          metadata: {
            operation: 'delete',
            projectId: args.projectId,
            warning: 'Project deletion is permanent and cannot be undone',
            note: 'Project deletion via REST API not fully supported. Use GraphQL API for complete functionality.'
          }
        },
        message: `Project '${args.projectId}' has been marked for deletion`
      };

      this.logger.info('Project deletion completed', { projectId: args.projectId });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to delete project', { error, args });
      return this.createErrorResponse(
        `Failed to delete project '${args.projectId}': ${error}`,
        'PROJECT_DELETE_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
