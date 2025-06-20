import { getGraphQLClient, GraphQLClient } from '../GraphQLClient.js';
import { getRESTClient, RESTClient } from '../RESTClient.js';
import { logger } from '@/utils/logger.js';
import { GitHubAPIError, ValidationError } from '@/utils/errors.js';
import { cache } from '@/infrastructure/persistence/Cache.js';

export interface ProjectData {
  id: string;
  number: number;
  title: string;
  shortDescription?: string;
  readme?: string;
  visibility: 'private' | 'public';
  state: 'open' | 'closed';
  url: string;
  creator: {
    login: string;
    id: string;
  };
  owner: {
    login: string;
    id: string;
    type: 'User' | 'Organization';
  };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  fields: ProjectField[];
  views: ProjectView[];
  items: {
    totalCount: number;
    nodes: ProjectItem[];
  };
}

export interface ProjectField {
  id: string;
  name: string;
  dataType: 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'ITERATION';
  options?: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
  }>;
}

export interface ProjectView {
  id: string;
  name: string;
  layout: 'BOARD_LAYOUT' | 'TABLE_LAYOUT' | 'TIMELINE_LAYOUT';
  number: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectItem {
  id: string;
  type: 'ISSUE' | 'PULL_REQUEST' | 'DRAFT_ISSUE';
  content?: {
    id: string;
    number: number;
    title: string;
    url: string;
    state: string;
    assignees: Array<{ login: string }>;
    labels: Array<{ name: string; color: string }>;
  };
  fieldValues: Array<{
    field: { name: string; id: string };
    value: any;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  title: string;
  shortDescription?: string;
  readme?: string;
  visibility?: 'private' | 'public';
  template?: string;
}

export interface UpdateProjectRequest {
  title?: string;
  shortDescription?: string;
  readme?: string;
  visibility?: 'private' | 'public';
  state?: 'open' | 'closed';
}

export interface ProjectFilters {
  state?: 'open' | 'closed' | 'all';
  visibility?: 'private' | 'public';
  search?: string;
  orderBy?: 'created_at' | 'updated_at' | 'title';
  direction?: 'asc' | 'desc';
  first?: number;
  after?: string;
}

export interface AddProjectItemRequest {
  contentId: string;
  contentType: 'Issue' | 'PullRequest';
}

export interface UpdateProjectItemRequest {
  fieldValues: Array<{
    fieldId: string;
    value: any;
  }>;
}

export class ProjectRepository {
  private readonly graphqlClient: GraphQLClient;
  private readonly restClient: RESTClient;

  constructor() {
    this.graphqlClient = getGraphQLClient();
    this.restClient = getRESTClient();
  }

  /**
   * Create a new GitHub Project v2
   */
  async createProject(ownerId: string, data: CreateProjectRequest): Promise<ProjectData> {
    try {
      logger.info('Creating project', { title: data.title, ownerId });
      
      const mutation = `
        mutation CreateProject($ownerId: ID!, $title: String!, $shortDescription: String, $readme: String, $visibility: ProjectV2Visibility!) {
          createProjectV2(input: {
            ownerId: $ownerId,
            title: $title,
            shortDescription: $shortDescription,
            readme: $readme,
            visibility: $visibility
          }) {
            projectV2 {
              id
              number
              title
              shortDescription
              readme
              visibility
              state
              url
              createdAt
              updatedAt
              creator {
                login
                ... on User { id }
              }
              owner {
                login
                id
                __typename
              }
              fields(first: 100) {
                nodes {
                  id
                  name
                  dataType
                  ... on ProjectV2SingleSelectField {
                    options {
                      id
                      name
                      description
                      color
                    }
                  }
                }
              }
              views(first: 10) {
                nodes {
                  id
                  name
                  layout
                  number
                  createdAt
                  updatedAt
                }
              }
              items(first: 0) {
                totalCount
                nodes {
                  id
                }
              }
            }
          }
        }
      `;

      const response = await this.graphqlClient.query(mutation, {
        ownerId,
        title: data.title,
        shortDescription: data.shortDescription,
        readme: data.readme,
        visibility: (data.visibility || 'private').toUpperCase()
      });

      const project = this.transformProjectData(response.createProjectV2.projectV2);
      
      // Cache the created project
      await cache.set(`project:${project.id}`, project, 300000);
      await cache.invalidate('projects:list:*');
      
      logger.info('Project created successfully', { projectId: project.id, title: project.title });
      
      return project;
    } catch (error) {
      logger.error('Failed to create project', { error, data });
      throw new GitHubAPIError(
        `Failed to create project: ${error instanceof Error ? error.message : String(error)}`,
        'PROJECT_CREATE_ERROR',
        { data, ownerId }
      );
    }
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string): Promise<ProjectData> {
    try {
      // Try cache first
      const cached = await cache.get<ProjectData>(`project:${projectId}`);
      if (cached) {
        return cached;
      }

      logger.debug('Fetching project', { projectId });
      
      const query = `
        query GetProject($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              id
              number
              title
              shortDescription
              readme
              visibility
              state
              url
              createdAt
              updatedAt
              closedAt
              creator {
                login
                ... on User { id }
              }
              owner {
                login
                id
                __typename
              }
              fields(first: 100) {
                nodes {
                  id
                  name
                  dataType
                  ... on ProjectV2SingleSelectField {
                    options {
                      id
                      name
                      description
                      color
                    }
                  }
                }
              }
              views(first: 10) {
                nodes {
                  id
                  name
                  layout
                  number
                  createdAt
                  updatedAt
                }
              }
              items(first: 100) {
                totalCount
                nodes {
                  id
                  type
                  createdAt
                  updatedAt
                  content {
                    ... on Issue {
                      id
                      number
                      title
                      url
                      state
                      assignees(first: 10) {
                        nodes {
                          login
                        }
                      }
                      labels(first: 20) {
                        nodes {
                          name
                          color
                        }
                      }
                    }
                    ... on PullRequest {
                      id
                      number
                      title
                      url
                      state
                      assignees(first: 10) {
                        nodes {
                          login
                        }
                      }
                      labels(first: 20) {
                        nodes {
                          name
                          color
                        }
                      }
                    }
                  }
                  fieldValues(first: 100) {
                    nodes {
                      field {
                        name
                        id
                      }
                      value
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.graphqlClient.query(query, { projectId });
      
      if (!response.node) {
        throw new GitHubAPIError(`Project not found: ${projectId}`, 'PROJECT_NOT_FOUND');
      }

      const project = this.transformProjectData(response.node);
      
      // Cache the project
      await cache.set(`project:${projectId}`, project, 300000);
      
      return project;
    } catch (error) {
      logger.error('Failed to get project', { error, projectId });
      
      if (error instanceof GitHubAPIError) {
        throw error;
      }
      
      throw new GitHubAPIError(
        `Failed to get project: ${error instanceof Error ? error.message : String(error)}`,
        'PROJECT_GET_ERROR',
        { projectId }
      );
    }
  }

  /**
   * Update project
   */
  async updateProject(projectId: string, data: UpdateProjectRequest): Promise<ProjectData> {
    try {
      logger.info('Updating project', { projectId, updates: Object.keys(data) });
      
      const mutation = `
        mutation UpdateProject(
          $projectId: ID!,
          $title: String,
          $shortDescription: String,
          $readme: String,
          $visibility: ProjectV2Visibility,
          $state: ProjectV2State
        ) {
          updateProjectV2(input: {
            projectId: $projectId,
            title: $title,
            shortDescription: $shortDescription,
            readme: $readme,
            visibility: $visibility,
            state: $state
          }) {
            projectV2 {
              id
              number
              title
              shortDescription
              readme
              visibility
              state
              url
              updatedAt
            }
          }
        }
      `;

      const variables: any = { projectId };
      if (data.title) variables.title = data.title;
      if (data.shortDescription !== undefined) variables.shortDescription = data.shortDescription;
      if (data.readme !== undefined) variables.readme = data.readme;
      if (data.visibility) variables.visibility = data.visibility.toUpperCase();
      if (data.state) variables.state = data.state.toUpperCase();

      const response = await this.graphqlClient.query(mutation, variables);
      
      // Invalidate cache and get fresh data
      await cache.invalidate(`project:${projectId}`);
      await cache.invalidate('projects:list:*');
      
      const updatedProject = await this.getProject(projectId);
      
      logger.info('Project updated successfully', { projectId });
      
      return updatedProject;
    } catch (error) {
      logger.error('Failed to update project', { error, projectId, data });
      throw new GitHubAPIError(
        `Failed to update project: ${error instanceof Error ? error.message : String(error)}`,
        'PROJECT_UPDATE_ERROR',
        { projectId, data }
      );
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectId: string): Promise<void> {
    try {
      logger.info('Deleting project', { projectId });
      
      const mutation = `
        mutation DeleteProject($projectId: ID!) {
          deleteProjectV2(input: { projectId: $projectId }) {
            projectV2 {
              id
            }
          }
        }
      `;

      await this.graphqlClient.query(mutation, { projectId });
      
      // Clean up cache
      await cache.invalidate(`project:${projectId}`);
      await cache.invalidate('projects:list:*');
      
      logger.info('Project deleted successfully', { projectId });
    } catch (error) {
      logger.error('Failed to delete project', { error, projectId });
      throw new GitHubAPIError(
        `Failed to delete project: ${error instanceof Error ? error.message : String(error)}`,
        'PROJECT_DELETE_ERROR',
        { projectId }
      );
    }
  }

  /**
   * List projects for an owner
   */
  async listProjects(ownerId: string, filters: ProjectFilters = {}): Promise<{ projects: ProjectData[]; hasNextPage: boolean; endCursor?: string }> {
    try {
      logger.debug('Listing projects', { ownerId, filters });
      
      const query = `
        query ListProjects(
          $ownerId: ID!,
          $first: Int,
          $after: String,
          $orderBy: ProjectV2OrderField,
          $direction: OrderDirection,
          $query: String
        ) {
          node(id: $ownerId) {
            ... on User {
              projectsV2(
                first: $first,
                after: $after,
                orderBy: { field: $orderBy, direction: $direction },
                query: $query
              ) {
                totalCount
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  number
                  title
                  shortDescription
                  visibility
                  state
                  url
                  createdAt
                  updatedAt
                  closedAt
                  creator {
                    login
                    ... on User { id }
                  }
                  items(first: 0) {
                    totalCount
                  }
                  fields(first: 10) {
                    totalCount
                  }
                  views(first: 10) {
                    totalCount
                  }
                }
              }
            }
            ... on Organization {
              projectsV2(
                first: $first,
                after: $after,
                orderBy: { field: $orderBy, direction: $direction },
                query: $query
              ) {
                totalCount
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  number
                  title
                  shortDescription
                  visibility
                  state
                  url
                  createdAt
                  updatedAt
                  closedAt
                  creator {
                    login
                    ... on User { id }
                  }
                  items(first: 0) {
                    totalCount
                  }
                  fields(first: 10) {
                    totalCount
                  }
                  views(first: 10) {
                    totalCount
                  }
                }
              }
            }
          }
        }
      `;

      // Build query string for filtering
      let queryString = '';
      if (filters.state && filters.state !== 'all') {
        queryString += `state:${filters.state} `;
      }
      if (filters.visibility) {
        queryString += `visibility:${filters.visibility} `;
      }
      if (filters.search) {
        queryString += filters.search;
      }

      const variables = {
        ownerId,
        first: filters.first || 30,
        after: filters.after,
        orderBy: (filters.orderBy || 'updated_at').toUpperCase(),
        direction: (filters.direction || 'desc').toUpperCase(),
        query: queryString.trim() || null
      };

      const response = await this.graphqlClient.query(query, variables);
      
      if (!response.node || !response.node.projectsV2) {
        return { projects: [], hasNextPage: false };
      }

      const projectsData = response.node.projectsV2;
      const projects = projectsData.nodes.map((node: any) => this.transformProjectData({
        ...node,
        owner: { login: 'owner', id: ownerId, __typename: 'User' }, // Add missing owner data
        fields: { nodes: [] },
        views: { nodes: [] },
        items: { totalCount: node.items.totalCount, nodes: [] }
      }));

      return {
        projects,
        hasNextPage: projectsData.pageInfo.hasNextPage,
        endCursor: projectsData.pageInfo.endCursor
      };
    } catch (error) {
      logger.error('Failed to list projects', { error, ownerId, filters });
      throw new GitHubAPIError(
        `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`,
        'PROJECT_LIST_ERROR',
        { ownerId, filters }
      );
    }
  }

  /**
   * Add item to project
   */
  async addItemToProject(projectId: string, data: AddProjectItemRequest): Promise<ProjectItem> {
    try {
      logger.info('Adding item to project', { projectId, contentId: data.contentId });
      
      const mutation = `
        mutation AddProjectItem($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: {
            projectId: $projectId,
            contentId: $contentId
          }) {
            item {
              id
              type
              createdAt
              updatedAt
              content {
                ... on Issue {
                  id
                  number
                  title
                  url
                  state
                }
                ... on PullRequest {
                  id
                  number
                  title
                  url
                  state
                }
              }
            }
          }
        }
      `;

      const response = await this.graphqlClient.query(mutation, {
        projectId,
        contentId: data.contentId
      });

      // Invalidate project cache
      await cache.invalidate(`project:${projectId}`);
      
      const item = this.transformProjectItem(response.addProjectV2ItemById.item);
      
      logger.info('Item added to project successfully', { projectId, itemId: item.id });
      
      return item;
    } catch (error) {
      logger.error('Failed to add item to project', { error, projectId, data });
      throw new GitHubAPIError(
        `Failed to add item to project: ${error instanceof Error ? error.message : String(error)}`,
        'PROJECT_ADD_ITEM_ERROR',
        { projectId, data }
      );
    }
  }

  /**
   * Update project item field values
   */
  async updateProjectItem(projectId: string, itemId: string, data: UpdateProjectItemRequest): Promise<ProjectItem> {
    try {
      logger.info('Updating project item', { projectId, itemId, fieldCount: data.fieldValues.length });
      
      // Update each field value individually (GitHub API limitation)
      for (const fieldValue of data.fieldValues) {
        const mutation = `
          mutation UpdateProjectItemField(
            $projectId: ID!,
            $itemId: ID!,
            $fieldId: ID!,
            $value: ProjectV2FieldValue!
          ) {
            updateProjectV2ItemFieldValue(input: {
              projectId: $projectId,
              itemId: $itemId,
              fieldId: $fieldId,
              value: $value
            }) {
              projectV2Item {
                id
              }
            }
          }
        `;

        await this.graphqlClient.query(mutation, {
          projectId,
          itemId,
          fieldId: fieldValue.fieldId,
          value: fieldValue.value
        });
      }

      // Invalidate cache and get updated item
      await cache.invalidate(`project:${projectId}`);
      
      // Get the updated project to return the item
      const project = await this.getProject(projectId);
      const updatedItem = project.items.nodes.find(item => item.id === itemId);
      
      if (!updatedItem) {
        throw new GitHubAPIError(`Project item not found: ${itemId}`, 'PROJECT_ITEM_NOT_FOUND');
      }
      
      logger.info('Project item updated successfully', { projectId, itemId });
      
      return updatedItem;
    } catch (error) {
      logger.error('Failed to update project item', { error, projectId, itemId, data });
      throw new GitHubAPIError(
        `Failed to update project item: ${error instanceof Error ? error.message : String(error)}`,
        'PROJECT_UPDATE_ITEM_ERROR',
        { projectId, itemId, data }
      );
    }
  }

  /**
   * Remove item from project
   */
  async removeItemFromProject(projectId: string, itemId: string): Promise<void> {
    try {
      logger.info('Removing item from project', { projectId, itemId });
      
      const mutation = `
        mutation RemoveProjectItem($projectId: ID!, $itemId: ID!) {
          deleteProjectV2Item(input: {
            projectId: $projectId,
            itemId: $itemId
          }) {
            deletedItemId
          }
        }
      `;

      await this.graphqlClient.query(mutation, { projectId, itemId });
      
      // Invalidate cache
      await cache.invalidate(`project:${projectId}`);
      
      logger.info('Item removed from project successfully', { projectId, itemId });
    } catch (error) {
      logger.error('Failed to remove item from project', { error, projectId, itemId });
      throw new GitHubAPIError(
        `Failed to remove item from project: ${error instanceof Error ? error.message : String(error)}`,
        'PROJECT_REMOVE_ITEM_ERROR',
        { projectId, itemId }
      );
    }
  }

  /**
   * Transform raw project data from GraphQL to our domain model
   */
  private transformProjectData(rawProject: any): ProjectData {
    return {
      id: rawProject.id,
      number: rawProject.number,
      title: rawProject.title,
      shortDescription: rawProject.shortDescription,
      readme: rawProject.readme,
      visibility: rawProject.visibility.toLowerCase(),
      state: rawProject.state.toLowerCase(),
      url: rawProject.url,
      creator: {
        login: rawProject.creator.login,
        id: rawProject.creator.id
      },
      owner: {
        login: rawProject.owner.login,
        id: rawProject.owner.id,
        type: rawProject.owner.__typename
      },
      createdAt: rawProject.createdAt,
      updatedAt: rawProject.updatedAt,
      closedAt: rawProject.closedAt,
      fields: rawProject.fields.nodes.map((field: any) => ({
        id: field.id,
        name: field.name,
        dataType: field.dataType,
        options: field.options || []
      })),
      views: rawProject.views.nodes.map((view: any) => ({
        id: view.id,
        name: view.name,
        layout: view.layout,
        number: view.number,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt
      })),
      items: {
        totalCount: rawProject.items.totalCount,
        nodes: rawProject.items.nodes.map((item: any) => this.transformProjectItem(item))
      }
    };
  }

  /**
   * Transform raw project item data
   */
  private transformProjectItem(rawItem: any): ProjectItem {
    return {
      id: rawItem.id,
      type: rawItem.type,
      content: rawItem.content ? {
        id: rawItem.content.id,
        number: rawItem.content.number,
        title: rawItem.content.title,
        url: rawItem.content.url,
        state: rawItem.content.state,
        assignees: rawItem.content.assignees?.nodes?.map((a: any) => ({ login: a.login })) || [],
        labels: rawItem.content.labels?.nodes?.map((l: any) => ({ name: l.name, color: l.color })) || []
      } : undefined,
      fieldValues: rawItem.fieldValues?.nodes?.map((fv: any) => ({
        field: {
          name: fv.field.name,
          id: fv.field.id
        },
        value: fv.value
      })) || [],
      createdAt: rawItem.createdAt,
      updatedAt: rawItem.updatedAt
    };
  }
}

// Singleton instance
let projectRepositoryInstance: ProjectRepository | null = null;

export function getProjectRepository(): ProjectRepository {
  if (!projectRepositoryInstance) {
    projectRepositoryInstance = new ProjectRepository();
  }
  return projectRepositoryInstance;
}