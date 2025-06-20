import { z } from 'zod';
import { BaseTool, ToolMetadata } from '@/tools/base/BaseTool.js';
import { CreateProjectSchema, type CreateProjectRequest } from '@/domain/schemas/project.schema.js';
import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { createModuleLogger } from '@/utils/logger.js';
import { ToolResult } from '@/types/tools.js';

/**
 * Tool for creating new GitHub projects with comprehensive configuration
 */
export class CreateProjectTool extends BaseTool<CreateProjectRequest> {
  public readonly metadata: ToolMetadata = {
    name: 'create_project',
    description: 'Create a new GitHub project',
    category: 'github',
    subcategory: 'projects',
    functionType: 'create',
    version: '1.0.0',
    stability: 'stable'
  };

  public readonly schema = CreateProjectSchema;
  private readonly githubClient: GitHubClient;
  private readonly logger = createModuleLogger('CreateProjectTool');

  constructor() {
    super();
    this.githubClient = new GitHubClient();
  }

  protected async executeImpl(args: CreateProjectRequest): Promise<ToolResult> {
    try {
      this.logger.info('Creating GitHub project', { title: args.title, owner: args.owner });

      // Create the project using GitHub API
      const project = await this.githubClient.createProject(
        args.title,
        args.shortDescription
      );

      const response = {
        success: true,
        data: {
          project: {
            id: project.id,
            title: project.name || args.title,
            description: args.shortDescription,
            visibility: args.visibility,
            state: 'open',
            url: project.html_url,
            createdAt: project.created_at,
            updatedAt: project.updated_at
          },
          metadata: {
            owner: args.owner,
            visibility: args.visibility,
            createdBy: 'GitHub Project Manager MCP',
            timestamp: new Date().toISOString()
          }
        },
        message: `Successfully created project '${args.title}'`
      };

      this.logger.info('Project created successfully', { projectId: project.id, title: args.title });
      return this.createSuccessResponse(response);

    } catch (error) {
      this.logger.error('Failed to create project', { error, args });
      return this.createErrorResponse(
        `Failed to create project '${args.title}': ${error}`,
        'PROJECT_CREATION_FAILED',
        { args, error: String(error) }
      );
    }
  }
}
