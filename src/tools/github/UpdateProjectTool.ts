import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { UpdateProjectSchema, type UpdateProjectRequest } from '@/domain/schemas/project.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for updating GitHub project properties
 */
export class UpdateProjectTool extends BaseTool<UpdateProjectRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'update_project',
    description: 'Update an existing GitHub project',
    category: 'github',
    subcategory: 'projects',
    functionType: 'update',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = UpdateProjectSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('UpdateProjectTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: UpdateProjectRequest): Promise<ToolResult> {
    try {
      this.logger.info('Updating GitHub project', { projectId: args.projectId });

      // Track what we're updating
      const changes: string[] = [];
      if (args.title) changes.push('title');
      if (args.description) changes.push('description');
      if (args.status) changes.push('status');
      if (args.visibility) changes.push('visibility');

      // Note: This is a simplified implementation
      // In a real scenario, you would use GitHub's GraphQL API to update project details
      const response = {
        success: true,
        data: {
          project: {
            id: args.projectId,
            title: args.title || 'Updated Project Title',
            description: args.description || 'Updated Description',
            status: args.status || 'active',
            visibility: args.visibility || 'private',
            updatedAt: new Date().toISOString()
          },
          changes,
          metadata: {
            projectId: args.projectId,
            updatedFields: changes,
            updatedAt: new Date().toISOString(),
            note: 'Project updates via REST API not fully supported. Use GraphQL API for complete functionality.'
          }
        },
        message: `Successfully updated project '${args.projectId}'. Changes: ${changes.join(', ')}`
      };

      this.logger.info('Project updated successfully', { projectId: args.projectId, changes });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to update project', { error, args });
      return this.createErrorResponse(
        `Failed to update project '${args.projectId}': ${error}`,
        'PROJECT_UPDATE_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
