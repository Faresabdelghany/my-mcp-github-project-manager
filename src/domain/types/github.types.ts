// GitHub API response types and interfaces

export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: GitHubUser;
  html_url: string;
  description?: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  user: GitHubUser;
  assignees: GitHubUser[];
  labels: GitHubLabel[];
  milestone?: GitHubMilestone;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  description?: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  due_on?: string;
  closed_at?: string;
}

export interface GitHubProject {
  id: number;
  name: string;
  body?: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  html_url: string;
  creator: GitHubUser;
}

// API request types
export interface CreateRepositoryRequest {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
}

export interface CreateIssueRequest {
  title: string;
  body?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface UpdateIssueRequest {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface CreateMilestoneRequest {
  title: string;
  description?: string;
  due_on?: string;
  state?: 'open' | 'closed';
}

export interface UpdateMilestoneRequest {
  title?: string;
  description?: string;
  due_on?: string;
  state?: 'open' | 'closed';
}

// Error types
export interface GitHubAPIError {
  message: string;
  status: number;
  response?: any;
}

// Pagination types
export interface PaginationOptions {
  page?: number;
  per_page?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total_count?: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
}
