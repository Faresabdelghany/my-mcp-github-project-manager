import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import { config } from '@/config/index.js';
import { createModuleLogger } from '@/utils/logger.js';
import { GitHubAPIError } from '@/utils/errors.js';
import type {
  GitHubUser,
  GitHubRepository,
  GitHubIssue,
  GitHubMilestone,
  GitHubProject,
  GitHubLabel,
  CreateRepositoryRequest,
  CreateIssueRequest,
  UpdateIssueRequest,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  PaginationOptions,
  PaginatedResponse
} from '@/domain/types/github.types.js';

/**
 * GitHub API client wrapper providing high-level operations
 * for project management functionality
 */
export class GitHubClient {
  private octokit: Octokit;
  private graphqlClient: typeof graphql;
  private logger = createModuleLogger('GitHubClient');
  private readonly owner: string;
  private readonly repo: string;

  constructor() {
    this.octokit = new Octokit({
      auth: config.github.token,
      userAgent: config.github.userAgent,
      baseUrl: config.github.apiUrl
    });

    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${config.github.token}`
      }
    });

    this.owner = config.github.defaultOwner;
    this.repo = config.github.defaultRepo;
  }

  /**
   * Repository operations
   */
  async createRepository(request: CreateRepositoryRequest): Promise<GitHubRepository> {
    try {
      this.logger.info('Creating repository', { name: request.name });
      
      const response = await this.octokit.repos.createForAuthenticatedUser({
        name: request.name,
        description: request.description,
        private: request.private || false,
        auto_init: request.auto_init || true
      });

      return response.data as GitHubRepository;
    } catch (error) {
      this.logger.error('Failed to create repository', { error, request });
      throw new GitHubAPIError(`Failed to create repository: ${error}`);
    }
  }

  async getRepository(owner?: string, repo?: string): Promise<GitHubRepository> {
    try {
      const response = await this.octokit.repos.get({
        owner: owner || this.owner,
        repo: repo || this.repo
      });

      return response.data as GitHubRepository;
    } catch (error) {
      this.logger.error('Failed to get repository', { error, owner, repo });
      throw new GitHubAPIError(`Failed to get repository: ${error}`);
    }
  }

  /**
   * Issue operations
   */
  async createIssue(request: CreateIssueRequest, owner?: string, repo?: string): Promise<GitHubIssue> {
    try {
      this.logger.info('Creating issue', { title: request.title });
      
      const response = await this.octokit.issues.create({
        owner: owner || this.owner,
        repo: repo || this.repo,
        title: request.title,
        body: request.body,
        assignees: request.assignees,
        labels: request.labels,
        milestone: request.milestone
      });

      return response.data as GitHubIssue;
    } catch (error) {
      this.logger.error('Failed to create issue', { error, request });
      throw new GitHubAPIError(`Failed to create issue: ${error}`);
    }
  }

  async updateIssue(
    issueNumber: number, 
    request: UpdateIssueRequest, 
    owner?: string, 
    repo?: string
  ): Promise<GitHubIssue> {
    try {
      this.logger.info('Updating issue', { issueNumber, updates: Object.keys(request) });
      
      const response = await this.octokit.issues.update({
        owner: owner || this.owner,
        repo: repo || this.repo,
        issue_number: issueNumber,
        title: request.title,
        body: request.body,
        state: request.state,
        assignees: request.assignees,
        labels: request.labels,
        milestone: request.milestone
      });

      return response.data as GitHubIssue;
    } catch (error) {
      this.logger.error('Failed to update issue', { error, issueNumber, request });
      throw new GitHubAPIError(`Failed to update issue: ${error}`);
    }
  }

  async getIssue(issueNumber: number, owner?: string, repo?: string): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.issues.get({
        owner: owner || this.owner,
        repo: repo || this.repo,
        issue_number: issueNumber
      });

      return response.data as GitHubIssue;
    } catch (error) {
      this.logger.error('Failed to get issue', { error, issueNumber });
      throw new GitHubAPIError(`Failed to get issue: ${error}`);
    }
  }

  async listIssues(
    options: {
      state?: 'open' | 'closed' | 'all';
      assignee?: string;
      labels?: string;
      milestone?: string;
      sort?: 'created' | 'updated' | 'comments';
      direction?: 'asc' | 'desc';
    } & PaginationOptions = {},
    owner?: string, 
    repo?: string
  ): Promise<PaginatedResponse<GitHubIssue>> {
    try {
      const response = await this.octokit.issues.listForRepo({
        owner: owner || this.owner,
        repo: repo || this.repo,
        state: options.state || 'open',
        assignee: options.assignee,
        labels: options.labels,
        milestone: options.milestone,
        sort: options.sort || 'created',
        direction: options.direction || 'desc',
        page: options.page || 1,
        per_page: options.per_page || 30
      });

      return {
        data: response.data as GitHubIssue[],
        pagination: {
          page: options.page || 1,
          per_page: options.per_page || 30,
          has_next_page: response.data.length === (options.per_page || 30),
          has_previous_page: (options.page || 1) > 1
        }
      };
    } catch (error) {
      this.logger.error('Failed to list issues', { error, options });
      throw new GitHubAPIError(`Failed to list issues: ${error}`);
    }
  }

  /**
   * Milestone operations
   */
  async createMilestone(
    request: CreateMilestoneRequest, 
    owner?: string, 
    repo?: string
  ): Promise<GitHubMilestone> {
    try {
      this.logger.info('Creating milestone', { title: request.title });
      
      const response = await this.octokit.issues.createMilestone({
        owner: owner || this.owner,
        repo: repo || this.repo,
        title: request.title,
        description: request.description,
        due_on: request.due_on,
        state: request.state || 'open'
      });

      return response.data as GitHubMilestone;
    } catch (error) {
      this.logger.error('Failed to create milestone', { error, request });
      throw new GitHubAPIError(`Failed to create milestone: ${error}`);
    }
  }

  async updateMilestone(
    milestoneNumber: number,
    request: UpdateMilestoneRequest,
    owner?: string,
    repo?: string
  ): Promise<GitHubMilestone> {
    try {
      this.logger.info('Updating milestone', { milestoneNumber, updates: Object.keys(request) });
      
      const response = await this.octokit.issues.updateMilestone({
        owner: owner || this.owner,
        repo: repo || this.repo,
        milestone_number: milestoneNumber,
        title: request.title,
        description: request.description,
        due_on: request.due_on,
        state: request.state
      });

      return response.data as GitHubMilestone;
    } catch (error) {
      this.logger.error('Failed to update milestone', { error, milestoneNumber, request });
      throw new GitHubAPIError(`Failed to update milestone: ${error}`);
    }
  }

  async getMilestone(milestoneNumber: number, owner?: string, repo?: string): Promise<GitHubMilestone> {
    try {
      const response = await this.octokit.issues.getMilestone({
        owner: owner || this.owner,
        repo: repo || this.repo,
        milestone_number: milestoneNumber
      });

      return response.data as GitHubMilestone;
    } catch (error) {
      this.logger.error('Failed to get milestone', { error, milestoneNumber });
      throw new GitHubAPIError(`Failed to get milestone: ${error}`);
    }
  }

  async listMilestones(
    options: {
      state?: 'open' | 'closed' | 'all';
      sort?: 'due_on' | 'completeness';
      direction?: 'asc' | 'desc';
    } & PaginationOptions = {},
    owner?: string,
    repo?: string
  ): Promise<PaginatedResponse<GitHubMilestone>> {
    try {
      const response = await this.octokit.issues.listMilestones({
        owner: owner || this.owner,
        repo: repo || this.repo,
        state: options.state || 'open',
        sort: options.sort || 'due_on',
        direction: options.direction || 'asc',
        page: options.page || 1,
        per_page: options.per_page || 30
      });

      return {
        data: response.data as GitHubMilestone[],
        pagination: {
          page: options.page || 1,
          per_page: options.per_page || 30,
          has_next_page: response.data.length === (options.per_page || 30),
          has_previous_page: (options.page || 1) > 1
        }
      };
    } catch (error) {
      this.logger.error('Failed to list milestones', { error, options });
      throw new GitHubAPIError(`Failed to list milestones: ${error}`);
    }
  }

  async deleteMilestone(milestoneNumber: number, owner?: string, repo?: string): Promise<void> {
    try {
      this.logger.info('Deleting milestone', { milestoneNumber });
      
      await this.octokit.issues.deleteMilestone({
        owner: owner || this.owner,
        repo: repo || this.repo,
        milestone_number: milestoneNumber
      });
    } catch (error) {
      this.logger.error('Failed to delete milestone', { error, milestoneNumber });
      throw new GitHubAPIError(`Failed to delete milestone: ${error}`);
    }
  }

  /**
   * Label operations
   */
  async createLabel(
    name: string,
    color: string,
    description?: string,
    owner?: string,
    repo?: string
  ): Promise<GitHubLabel> {
    try {
      this.logger.info('Creating label', { name, color });
      
      const response = await this.octokit.issues.createLabel({
        owner: owner || this.owner,
        repo: repo || this.repo,
        name,
        color: color.replace('#', ''), // Remove # if present
        description
      });

      return response.data as GitHubLabel;
    } catch (error) {
      this.logger.error('Failed to create label', { error, name, color });
      throw new GitHubAPIError(`Failed to create label: ${error}`);
    }
  }

  async listLabels(owner?: string, repo?: string): Promise<GitHubLabel[]> {
    try {
      const response = await this.octokit.issues.listLabelsForRepo({
        owner: owner || this.owner,
        repo: repo || this.repo
      });

      return response.data as GitHubLabel[];
    } catch (error) {
      this.logger.error('Failed to list labels', { error });
      throw new GitHubAPIError(`Failed to list labels: ${error}`);
    }
  }

  /**
   * Project operations (GitHub Projects v2)
   */
  async createProject(title: string, body?: string): Promise<GitHubProject> {
    try {
      this.logger.info('Creating project via GraphQL', { title });
      
      const query = `
        mutation CreateProject($ownerId: ID!, $title: String!, $body: String) {
          createProjectV2(input: {ownerId: $ownerId, title: $title, body: $body}) {
            projectV2 {
              id
              title
              shortDescription
              url
              createdAt
              updatedAt
            }
          }
        }
      `;

      // Get the owner ID first
      const userResponse = await this.octokit.users.getAuthenticated();
      const ownerId = userResponse.data.node_id;

      const response = await this.graphqlClient(query, {
        ownerId,
        title,
        body
      });

      return response.createProjectV2.projectV2 as GitHubProject;
    } catch (error) {
      this.logger.error('Failed to create project', { error, title });
      throw new GitHubAPIError(`Failed to create project: ${error}`);
    }
  }

  /**
   * User operations
   */
  async getCurrentUser(): Promise<GitHubUser> {
    try {
      const response = await this.octokit.users.getAuthenticated();
      return response.data as GitHubUser;
    } catch (error) {
      this.logger.error('Failed to get current user', { error });
      throw new GitHubAPIError(`Failed to get current user: ${error}`);
    }
  }

  /**
   * Utility methods
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      this.logger.info('GitHub API connection validated successfully');
      return true;
    } catch (error) {
      this.logger.error('GitHub API connection validation failed', { error });
      return false;
    }
  }

  getRateLimitInfo() {
    // This would be populated after making API calls
    return this.octokit.rest;
  }
}

// Singleton instance
let githubClientInstance: GitHubClient | null = null;

export function getGitHubClient(): GitHubClient {
  if (!githubClientInstance) {
    githubClientInstance = new GitHubClient();
  }
  return githubClientInstance;
}
