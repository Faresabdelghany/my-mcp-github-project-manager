// GitHub Tools Registry
import { ToolRegistry } from '@/tools/base/ToolRegistry.js';
import { CreateProjectTool } from './CreateProjectTool.js';
import { ListProjectsTool } from './ListProjectsTool.js';
import { GetProjectTool } from './GetProjectTool.js';
import { UpdateProjectTool } from './UpdateProjectTool.js';
import { DeleteProjectTool } from './DeleteProjectTool.js';
import { CreateIssueTool } from './CreateIssueTool.js';
import { ListIssuesTool } from './ListIssuesTool.js';
import { GetIssueTool } from './GetIssueTool.js';
import { UpdateIssueTool } from './UpdateIssueTool.js';
import { CreateMilestoneTool } from './CreateMilestoneTool.js';
import { ListMilestonesTool } from './ListMilestonesTool.js';
import { GetMilestoneTool } from './GetMilestoneTool.js';
import { createModuleLogger } from '@/utils/logger.js';

const logger = createModuleLogger('GitHubToolsRegistry');

/**
 * Register all GitHub management tools with the tool registry
 */
export async function registerGitHubTools(registry: ToolRegistry): Promise<void> {
  logger.info('Registering GitHub management tools...');

  try {
    // Project Management Tools
    await registry.registerTool(new CreateProjectTool());
    await registry.registerTool(new ListProjectsTool());
    await registry.registerTool(new GetProjectTool());
    await registry.registerTool(new UpdateProjectTool());
    await registry.registerTool(new DeleteProjectTool());

    // Issue Management Tools
    await registry.registerTool(new CreateIssueTool());
    await registry.registerTool(new ListIssuesTool());
    await registry.registerTool(new GetIssueTool());
    await registry.registerTool(new UpdateIssueTool());

    // Milestone Management Tools
    await registry.registerTool(new CreateMilestoneTool());
    await registry.registerTool(new ListMilestonesTool());
    await registry.registerTool(new GetMilestoneTool());

    logger.info('GitHub management tools registered successfully', {
      toolCount: 12,
      categories: ['projects', 'issues', 'milestones']
    });

  } catch (error) {
    logger.error('Failed to register GitHub tools', { error });
    throw error;
  }
}

/**
 * Get all available GitHub tool metadata for documentation
 */
export function getGitHubToolsMetadata() {
  return {
    category: 'github',
    description: 'Comprehensive GitHub project management tools',
    version: '1.0.0',
    tools: {
      projects: [
        'create_project',
        'list_projects', 
        'get_project',
        'update_project',
        'delete_project'
      ],
      issues: [
        'create_issue',
        'list_issues',
        'get_issue', 
        'update_issue'
      ],
      milestones: [
        'create_milestone',
        'list_milestones',
        'get_milestone'
      ]
    },
    features: [
      'Full CRUD operations for projects, issues, and milestones',
      'Comprehensive filtering and pagination',
      'Progress tracking and metrics',
      'Advanced error handling and logging',
      'Schema validation with Zod',
      'Type-safe implementations'
    ]
  };
}

/**
 * Export individual tools for direct import if needed
 */
export {
  CreateProjectTool,
  ListProjectsTool,
  GetProjectTool,
  UpdateProjectTool,
  DeleteProjectTool,
  CreateIssueTool,
  ListIssuesTool,
  GetIssueTool,
  UpdateIssueTool,
  CreateMilestoneTool,
  ListMilestonesTool,
  GetMilestoneTool
};
