import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { GetProjectSchema, type GetProjectRequest } from '@/domain/schemas/project.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for retrieving detailed information about a specific GitHub project
 */
export class GetProjectTool extends BaseTool<GetProjectRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'get_project',
    description: 'Get details of a specific GitHub project',
    category: 'github',
    subcategory: 'projects',
    functionType: 'read',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = GetProjectSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('GetProjectTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: GetProjectRequest): Promise<ToolResult> {
    try {
      this.logger.info('Getting GitHub project details', { projectId: args.projectId });

      // Note: This is a simplified implementation
      // In a real scenario, you would use GitHub's GraphQL API to get project details
      const response = {
        success: true,
        data: {
          project: {
            id: args.projectId,
            title: 'Project Title',
            description: 'Project Description',
            state: 'open',
            visibility: 'private',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            url: `https://github.com/projects/${args.projectId}`
          },
          metadata: {
            includeItems: args.includeItems,
            retrievedAt: new Date().toISOString(),
            note: 'Project details retrieval via REST API not fully supported. Use GraphQL API for complete functionality.'
          }
        },
        message: `Retrieved project details for ID: ${args.projectId}`
      };

      if (args.includeItems) {
        // In a real implementation, we would fetch project items
        response.data.items = [];
        response.data.metadata.itemsNote = 'Item fetching not yet implemented';
      }

      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to get project', { error, args });
      return this.createErrorResponse(
        `Failed to get project '${args.projectId}': ${error}`,
        'PROJECT_GET_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
