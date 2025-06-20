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

export function registerGitHubTools(registry: ToolRegistry): void {
  // Project Management Tools
  registry.register(new CreateProjectTool());
  registry.register(new ListProjectsTool());
  registry.register(new GetProjectTool());
  registry.register(new UpdateProjectTool());
  registry.register(new DeleteProjectTool());

  // Issue Management Tools
  registry.register(new CreateIssueTool());
  registry.register(new ListIssuesTool());
  registry.register(new GetIssueTool());
  registry.register(new UpdateIssueTool());

  // Milestone Management Tools
  registry.register(new CreateMilestoneTool());
  registry.register(new ListMilestonesTool());
  registry.register(new GetMilestoneTool());

  // Register tool categories
  registry.registerCategory({
    name: 'Project Management',
    description: 'Tools for managing GitHub Projects v2 with full lifecycle support',
    tools: [
      'create_project',
      'list_projects', 
      'get_project',
      'update_project',
      'delete_project'
    ]
  });

  registry.registerCategory({
    name: 'Issue Management',
    description: 'Tools for comprehensive issue management with workflow automation',
    tools: [
      'create_issue',
      'list_issues',
      'get_issue',
      'update_issue'
    ]
  });

  registry.registerCategory({
    name: 'Milestone Management',
    description: 'Tools for planning and tracking milestone-based project organization',
    tools: [
      'create_milestone',
      'list_milestones',
      'get_milestone'
    ]
  });
}

// Export all tools for direct import if needed
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