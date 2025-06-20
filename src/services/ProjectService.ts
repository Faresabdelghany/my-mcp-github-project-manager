import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { cache, Cached } from '@/infrastructure/persistence/Cache.js';
import { fileSystem } from '@/infrastructure/persistence/FileSystem.js';
import { logger } from '@/utils/logger.js';
import { ServiceError, ValidationError } from '@/utils/errors.js';
import { CreateProjectSchema, UpdateProjectSchema, ListProjectsSchema } from '@/domain/schemas/project.schema.js';
import type { CreateProjectRequest, UpdateProjectRequest, ListProjectsRequest } from '@/domain/schemas/project.schema.js';

export interface Project {
  id: string;
  number: number;
  title: string;
  description?: string;
  state: 'open' | 'closed';
  visibility: 'private' | 'public';
  url: string;
  creator: string;
  createdAt: string;
  updatedAt: string;
  metadata: {
    itemCount: number;
    fieldCount: number;
    viewCount: number;
  };
}

export interface ProjectFilters {
  state?: 'open' | 'closed' | 'all';
  visibility?: 'private' | 'public';
  creator?: string;
  search?: string;
  limit?: number;
  page?: number;
}

export interface ProjectList {
  projects: Project[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ProjectWorkflow {
  id: string;
  projectId: string;
  name: string;
  description: string;
  triggers: string[];
  actions: string[];
  conditions: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMetrics {
  projectId: string;
  period: {
    start: string;
    end: string;
  };
  metrics: {
    totalItems: number;
    completedItems: number;
    inProgressItems: number;
    velocity: number;
    averageCompletionTime: number;
    issueDistribution: Record<string, number>;
  };
  trends: {
    velocityTrend: 'increasing' | 'decreasing' | 'stable';
    completionTrend: 'improving' | 'declining' | 'stable';
  };
}

export class ProjectService {
  private readonly githubClient: GitHubClient;

  constructor() {
    this.githubClient = new GitHubClient();
  }

  @Cached(300000) // 5 minutes
  async getProject(id: string): Promise<Project> {
    try {
      logger.debug('Getting project', { id });
      
      const project = await this.githubClient.getProject(id);
      
      if (!project) {
        throw new ServiceError(
          `Project not found: ${id}`,
          'PROJECT_NOT_FOUND',
          { projectId: id }
        );
      }

      // Transform GitHub project to our domain model
      const domainProject: Project = {
        id: project.id,
        number: project.number,
        title: project.title,
        description: project.description,
        state: project.state as 'open' | 'closed',
        visibility: project.visibility as 'private' | 'public',
        url: project.url,
        creator: project.creator.login,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        metadata: {
          itemCount: project.items?.totalCount || 0,
          fieldCount: project.fields?.length || 0,
          viewCount: project.views?.length || 0
        }
      };

      // Cache project metadata
      await this.cacheProjectMetadata(domainProject);
      
      return domainProject;
    } catch (error) {
      logger.error('Failed to get project', { id, error });
      
      if (error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        `Failed to retrieve project: ${id}`,
        'PROJECT_RETRIEVAL_ERROR',
        { projectId: id, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async createProject(data: CreateProjectRequest): Promise<Project> {
    try {
      // Validate input
      const validatedData = CreateProjectSchema.parse(data);
      
      logger.info('Creating project', { title: validatedData.title });
      
      // Create project via GitHub API
      const createdProject = await this.githubClient.createProject({
        title: validatedData.title,
        description: validatedData.description,
        visibility: validatedData.visibility || 'private'
      });

      // Transform to domain model
      const project: Project = {
        id: createdProject.id,
        number: createdProject.number,
        title: createdProject.title,
        description: createdProject.description,
        state: 'open',
        visibility: validatedData.visibility || 'private',
        url: createdProject.url,
        creator: createdProject.creator.login,
        createdAt: createdProject.created_at,
        updatedAt: createdProject.updated_at,
        metadata: {
          itemCount: 0,
          fieldCount: 0,
          viewCount: 1 // Default view
        }
      };

      // Initialize project workflows
      await this.initializeProjectWorkflows(project.id, validatedData.template);
      
      // Cache the new project
      await this.cacheProjectMetadata(project);
      
      // Invalidate project lists
      await cache.invalidate('projects:list:*');
      
      // Emit project creation event
      await this.emitEvent('project.created', { project });
      
      logger.info('Project created successfully', { projectId: project.id, title: project.title });
      
      return project;
    } catch (error) {
      logger.error('Failed to create project', { data, error });
      
      if (error instanceof ValidationError || error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        'Failed to create project',
        'PROJECT_CREATION_ERROR',
        { data, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
    try {
      // Validate input
      const validatedData = UpdateProjectSchema.parse(data);
      
      logger.info('Updating project', { id, updates: Object.keys(validatedData) });
      
      // Get current project
      const currentProject = await this.getProject(id);
      
      // Update via GitHub API
      const updatedProject = await this.githubClient.updateProject(id, validatedData);
      
      // Transform to domain model
      const project: Project = {
        id: updatedProject.id,
        number: updatedProject.number,
        title: updatedProject.title,
        description: updatedProject.description,
        state: updatedProject.state as 'open' | 'closed',
        visibility: updatedProject.visibility as 'private' | 'public',
        url: updatedProject.url,
        creator: updatedProject.creator.login,
        createdAt: updatedProject.created_at,
        updatedAt: updatedProject.updated_at,
        metadata: currentProject.metadata // Preserve metadata
      };
      
      // Update cache
      await cache.invalidate(`project:${id}`);
      await cache.invalidate('projects:list:*');
      await this.cacheProjectMetadata(project);
      
      // Emit project update event
      await this.emitEvent('project.updated', { 
        project, 
        changes: this.calculateChanges(currentProject, project) 
      });
      
      logger.info('Project updated successfully', { projectId: id });
      
      return project;
    } catch (error) {
      logger.error('Failed to update project', { id, data, error });
      
      if (error instanceof ValidationError || error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        `Failed to update project: ${id}`,
        'PROJECT_UPDATE_ERROR',
        { projectId: id, data, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      logger.info('Deleting project', { id });
      
      // Get project before deletion for event
      const project = await this.getProject(id);
      
      // Create backup
      await this.backupProject(project);
      
      // Delete via GitHub API
      await this.githubClient.deleteProject(id);
      
      // Clean up cache and local data
      await cache.invalidate(`project:${id}`);
      await cache.invalidate('projects:list:*');
      await this.cleanupProjectData(id);
      
      // Emit project deletion event
      await this.emitEvent('project.deleted', { project });
      
      logger.info('Project deleted successfully', { projectId: id });
    } catch (error) {
      logger.error('Failed to delete project', { id, error });
      
      if (error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        `Failed to delete project: ${id}`,
        'PROJECT_DELETION_ERROR',
        { projectId: id, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  @Cached(120000) // 2 minutes
  async listProjects(filters: ProjectFilters = {}): Promise<ProjectList> {
    try {
      // Validate filters
      const validatedFilters = ListProjectsSchema.parse(filters);
      
      logger.debug('Listing projects', { filters: validatedFilters });
      
      // Get projects from GitHub API
      const githubProjects = await this.githubClient.listProjects({
        state: validatedFilters.state || 'all',
        per_page: validatedFilters.limit || 30,
        page: validatedFilters.page || 1
      });
      
      // Transform to domain models
      const projects: Project[] = githubProjects.map(project => ({
        id: project.id,
        number: project.number,
        title: project.title,
        description: project.description,
        state: project.state as 'open' | 'closed',
        visibility: project.visibility as 'private' | 'public',
        url: project.url,
        creator: project.creator.login,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        metadata: {
          itemCount: project.items?.totalCount || 0,
          fieldCount: project.fields?.length || 0,
          viewCount: project.views?.length || 0
        }
      }));
      
      // Apply client-side filters
      let filteredProjects = projects;
      
      if (validatedFilters.search) {
        const searchTerm = validatedFilters.search.toLowerCase();
        filteredProjects = projects.filter(project => 
          project.title.toLowerCase().includes(searchTerm) ||
          project.description?.toLowerCase().includes(searchTerm)
        );
      }
      
      if (validatedFilters.creator) {
        filteredProjects = filteredProjects.filter(project => 
          project.creator === validatedFilters.creator
        );
      }
      
      if (validatedFilters.visibility) {
        filteredProjects = filteredProjects.filter(project => 
          project.visibility === validatedFilters.visibility
        );
      }
      
      const limit = validatedFilters.limit || 30;
      const page = validatedFilters.page || 1;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedProjects = filteredProjects.slice(startIndex, endIndex);
      
      return {
        projects: paginatedProjects,
        total: filteredProjects.length,
        page,
        limit,
        hasMore: endIndex < filteredProjects.length
      };
    } catch (error) {
      logger.error('Failed to list projects', { filters, error });
      
      if (error instanceof ValidationError || error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        'Failed to list projects',
        'PROJECT_LIST_ERROR',
        { filters, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getProjectMetrics(id: string, startDate?: string, endDate?: string): Promise<ProjectMetrics> {
    try {
      logger.debug('Getting project metrics', { id, startDate, endDate });
      
      // Implementation would fetch metrics from GitHub API and calculate trends
      // This is a simplified version
      const project = await this.getProject(id);
      
      return {
        projectId: id,
        period: {
          start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: endDate || new Date().toISOString()
        },
        metrics: {
          totalItems: project.metadata.itemCount,
          completedItems: 0, // Would be calculated
          inProgressItems: 0, // Would be calculated
          velocity: 0, // Would be calculated
          averageCompletionTime: 0, // Would be calculated
          issueDistribution: {} // Would be calculated
        },
        trends: {
          velocityTrend: 'stable',
          completionTrend: 'stable'
        }
      };
    } catch (error) {
      logger.error('Failed to get project metrics', { id, error });
      
      throw new ServiceError(
        `Failed to get project metrics: ${id}`,
        'PROJECT_METRICS_ERROR',
        { projectId: id, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async cacheProjectMetadata(project: Project): Promise<void> {
    await cache.set(`project:${project.id}`, project, 300000); // 5 minutes
    await fileSystem.writeFile(
      `projects/${project.id}/metadata.json`,
      {
        id: project.id,
        title: project.title,
        lastCached: new Date().toISOString(),
        metadata: project.metadata
      },
      { atomic: true }
    );
  }

  private async initializeProjectWorkflows(projectId: string, template?: string): Promise<void> {
    // Initialize default workflows based on template
    const defaultWorkflows: Partial<ProjectWorkflow>[] = [
      {
        name: 'Auto-assign issues',
        description: 'Automatically assign issues based on labels',
        triggers: ['issue.created'],
        actions: ['assign_to_team_member'],
        conditions: ['has_label:bug', 'has_label:feature'],
        enabled: false
      }
    ];
    
    for (const workflow of defaultWorkflows) {
      await fileSystem.writeFile(
        `projects/${projectId}/workflows/${workflow.name?.replace(/\s+/g, '_')}.json`,
        {
          id: `${projectId}_${workflow.name?.replace(/\s+/g, '_')}`,
          projectId,
          ...workflow,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      );
    }
  }

  private async backupProject(project: Project): Promise<void> {
    const backupData = {
      project,
      backedUpAt: new Date().toISOString(),
      version: '1.0'
    };
    
    await fileSystem.writeFile(
      `backups/projects/${project.id}_${Date.now()}.json`,
      backupData,
      { compress: true }
    );
  }

  private async cleanupProjectData(projectId: string): Promise<void> {
    try {
      const projectFiles = await fileSystem.listFiles(`projects/${projectId}`);
      for (const file of projectFiles) {
        await fileSystem.deleteFile(file.path);
      }
    } catch (error) {
      logger.warn('Failed to cleanup project data', { projectId, error });
    }
  }

  private calculateChanges(oldProject: Project, newProject: Project): Record<string, any> {
    const changes: Record<string, any> = {};
    
    if (oldProject.title !== newProject.title) {
      changes.title = { from: oldProject.title, to: newProject.title };
    }
    
    if (oldProject.description !== newProject.description) {
      changes.description = { from: oldProject.description, to: newProject.description };
    }
    
    if (oldProject.state !== newProject.state) {
      changes.state = { from: oldProject.state, to: newProject.state };
    }
    
    return changes;
  }

  private async emitEvent(eventType: string, data: any): Promise<void> {
    // Event emission would be handled by an event bus
    logger.debug('Emitting project event', { eventType, data });
    
    // Store event for audit trail
    await fileSystem.writeFile(
      `events/projects/${Date.now()}_${eventType.replace('.', '_')}.json`,
      {
        type: eventType,
        timestamp: new Date().toISOString(),
        data
      }
    );
  }
}

// Singleton instance
export const projectService = new ProjectService();