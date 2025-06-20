import { GitHubClient } from '@/infrastructure/github/GitHubClient.js';
import { cache, Cached } from '@/infrastructure/persistence/Cache.js';
import { fileSystem } from '@/infrastructure/persistence/FileSystem.js';
import { projectService } from './ProjectService.js';
import { logger } from '@/utils/logger.js';
import { ServiceError, ValidationError } from '@/utils/errors.js';
import { CreateIssueSchema, UpdateIssueSchema, ListIssuesSchema } from '@/domain/schemas/issue.schema.js';
import type { CreateIssueRequest, UpdateIssueRequest, ListIssuesRequest } from '@/domain/schemas/issue.schema.js';

export interface Task {
  id: string;
  number: number;
  title: string;
  description?: string;
  state: 'open' | 'closed';
  assignees: string[];
  labels: string[];
  milestone?: {
    id: string;
    title: string;
    number: number;
  };
  projectId?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  complexity: number; // 1-10 scale
  estimatedHours?: number;
  actualHours?: number;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  creator: string;
  metadata: {
    commentCount: number;
    reactionCount: number;
    linkedPRs: number;
    statusHistory: TaskStatusChange[];
  };
}

export interface TaskStatusChange {
  from: string;
  to: string;
  changedBy: string;
  changedAt: string;
  reason?: string;
}

export interface TaskFilters {
  state?: 'open' | 'closed' | 'all';
  assignee?: string;
  creator?: string;
  labels?: string[];
  milestone?: string;
  projectId?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  complexity?: { min?: number; max?: number };
  search?: string;
  sortBy?: 'created' | 'updated' | 'priority' | 'complexity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  page?: number;
}

export interface TaskList {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  summary: {
    byState: Record<string, number>;
    byPriority: Record<string, number>;
    byAssignee: Record<string, number>;
    averageComplexity: number;
    totalEstimatedHours: number;
  };
}

export interface TaskAutomation {
  id: string;
  name: string;
  description: string;
  trigger: {
    event: string;
    conditions: Record<string, any>;
  };
  actions: {
    type: string;
    parameters: Record<string, any>;
  }[];
  enabled: boolean;
  lastExecuted?: string;
  executionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependency {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  type: 'blocks' | 'depends_on' | 'relates_to';
  description?: string;
  createdAt: string;
  createdBy: string;
}

export interface TaskWorkflow {
  id: string;
  name: string;
  states: {
    id: string;
    name: string;
    description: string;
    color: string;
  }[];
  transitions: {
    from: string;
    to: string;
    conditions?: string[];
    actions?: string[];
  }[];
  defaultState: string;
  finalStates: string[];
}

export interface TaskMetrics {
  taskId: string;
  metrics: {
    timeToComplete?: number; // hours
    timeInState: Record<string, number>; // hours per state
    assigneeChanges: number;
    priorityChanges: number;
    commentActivity: number;
    collaboratorCount: number;
  };
  velocity: {
    storyPoints?: number;
    actualVsEstimated: number; // ratio
    cycleTime: number; // hours
  };
  quality: {
    bugCount: number;
    reworkTime: number;
    testCoverage?: number;
  };
}

export class TaskService {
  private readonly githubClient: GitHubClient;
  private readonly workflows = new Map<string, TaskWorkflow>();
  private readonly automations = new Map<string, TaskAutomation>();

  constructor() {
    this.githubClient = new GitHubClient();
    this.initializeDefaultWorkflows();
  }

  @Cached(180000) // 3 minutes
  async getTask(id: string): Promise<Task> {
    try {
      logger.debug('Getting task', { id });
      
      const issue = await this.githubClient.getIssue(parseInt(id));
      
      if (!issue) {
        throw new ServiceError(
          `Task not found: ${id}`,
          'TASK_NOT_FOUND',
          { taskId: id }
        );
      }

      // Get additional metadata
      const metadata = await this.getTaskMetadata(id);
      
      // Transform GitHub issue to our domain model
      const task: Task = {
        id: issue.id.toString(),
        number: issue.number,
        title: issue.title,
        description: issue.body,
        state: issue.state as 'open' | 'closed',
        assignees: issue.assignees.map(a => a.login),
        labels: issue.labels.map(l => l.name),
        milestone: issue.milestone ? {
          id: issue.milestone.id.toString(),
          title: issue.milestone.title,
          number: issue.milestone.number
        } : undefined,
        priority: this.extractPriority(issue.labels.map(l => l.name)),
        complexity: this.extractComplexity(issue.labels.map(l => l.name)),
        estimatedHours: this.extractEstimatedHours(issue.body),
        dueDate: this.extractDueDate(issue.body),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        url: issue.html_url,
        creator: issue.user.login,
        metadata: {
          commentCount: issue.comments,
          reactionCount: this.calculateReactionCount(issue.reactions),
          linkedPRs: 0, // Would need to fetch from GitHub API
          statusHistory: metadata.statusHistory || []
        }
      };

      // Cache task metadata
      await this.cacheTaskMetadata(task);
      
      return task;
    } catch (error) {
      logger.error('Failed to get task', { id, error });
      
      if (error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        `Failed to retrieve task: ${id}`,
        'TASK_RETRIEVAL_ERROR',
        { taskId: id, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async createTask(data: CreateIssueRequest): Promise<Task> {
    try {
      // Validate input
      const validatedData = CreateIssueSchema.parse(data);
      
      logger.info('Creating task', { title: validatedData.title });
      
      // Enrich description with metadata
      const enrichedDescription = this.enrichDescription(validatedData.body, {
        priority: validatedData.priority,
        complexity: validatedData.complexity,
        estimatedHours: validatedData.estimatedHours,
        dueDate: validatedData.dueDate
      });
      
      // Prepare labels
      const labels = [
        ...(validatedData.labels || []),
        ...this.generateAutomaticLabels(validatedData)
      ];
      
      // Create task via GitHub API
      const createdIssue = await this.githubClient.createIssue({
        title: validatedData.title,
        body: enrichedDescription,
        assignees: validatedData.assignees,
        labels,
        milestone: validatedData.milestone
      });

      // Transform to domain model
      const task: Task = {
        id: createdIssue.id.toString(),
        number: createdIssue.number,
        title: createdIssue.title,
        description: createdIssue.body,
        state: 'open',
        assignees: validatedData.assignees || [],
        labels,
        milestone: validatedData.milestone ? {
          id: validatedData.milestone.toString(),
          title: '', // Would need to fetch
          number: 0
        } : undefined,
        priority: validatedData.priority || 'medium',
        complexity: validatedData.complexity || 1,
        estimatedHours: validatedData.estimatedHours,
        dueDate: validatedData.dueDate,
        createdAt: createdIssue.created_at,
        updatedAt: createdIssue.updated_at,
        url: createdIssue.html_url,
        creator: createdIssue.user.login,
        metadata: {
          commentCount: 0,
          reactionCount: 0,
          linkedPRs: 0,
          statusHistory: [{
            from: 'none',
            to: 'open',
            changedBy: createdIssue.user.login,
            changedAt: createdIssue.created_at,
            reason: 'Task created'
          }]
        }
      };

      // Initialize task tracking
      await this.initializeTaskTracking(task);
      
      // Execute automations
      await this.executeAutomations('task.created', task);
      
      // Cache the new task
      await this.cacheTaskMetadata(task);
      
      // Invalidate task lists
      await cache.invalidate('tasks:list:*');
      
      // Emit task creation event
      await this.emitEvent('task.created', { task });
      
      logger.info('Task created successfully', { taskId: task.id, title: task.title });
      
      return task;
    } catch (error) {
      logger.error('Failed to create task', { data, error });
      
      if (error instanceof ValidationError || error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        'Failed to create task',
        'TASK_CREATION_ERROR',
        { data, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async updateTask(id: string, data: UpdateIssueRequest): Promise<Task> {
    try {
      // Validate input
      const validatedData = UpdateIssueSchema.parse(data);
      
      logger.info('Updating task', { id, updates: Object.keys(validatedData) });
      
      // Get current task
      const currentTask = await this.getTask(id);
      
      // Track status changes
      const statusChanges: TaskStatusChange[] = [];
      
      if (validatedData.state && validatedData.state !== currentTask.state) {
        statusChanges.push({
          from: currentTask.state,
          to: validatedData.state,
          changedBy: 'system', // Would be actual user
          changedAt: new Date().toISOString(),
          reason: 'Manual state change'
        });
      }
      
      // Update via GitHub API
      const updatedIssue = await this.githubClient.updateIssue(parseInt(id), validatedData);
      
      // Transform to domain model
      const task: Task = {
        ...currentTask,
        title: updatedIssue.title,
        description: updatedIssue.body,
        state: updatedIssue.state as 'open' | 'closed',
        assignees: updatedIssue.assignees.map(a => a.login),
        labels: updatedIssue.labels.map(l => l.name),
        updatedAt: updatedIssue.updated_at,
        metadata: {
          ...currentTask.metadata,
          statusHistory: [...currentTask.metadata.statusHistory, ...statusChanges]
        }
      };
      
      // Update task tracking
      await this.updateTaskTracking(task, currentTask);
      
      // Execute automations
      await this.executeAutomations('task.updated', { task, previousTask: currentTask });
      
      // Update cache
      await cache.invalidate(`task:${id}`);
      await cache.invalidate('tasks:list:*');
      await this.cacheTaskMetadata(task);
      
      // Emit task update event
      await this.emitEvent('task.updated', { 
        task, 
        previousTask: currentTask,
        changes: this.calculateChanges(currentTask, task) 
      });
      
      logger.info('Task updated successfully', { taskId: id });
      
      return task;
    } catch (error) {
      logger.error('Failed to update task', { id, data, error });
      
      if (error instanceof ValidationError || error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        `Failed to update task: ${id}`,
        'TASK_UPDATE_ERROR',
        { taskId: id, data, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  @Cached(120000) // 2 minutes
  async listTasks(filters: TaskFilters = {}): Promise<TaskList> {
    try {
      // Validate filters
      const validatedFilters = ListIssuesSchema.parse(filters);
      
      logger.debug('Listing tasks', { filters: validatedFilters });
      
      // Get issues from GitHub API
      const githubIssues = await this.githubClient.listIssues({
        state: validatedFilters.state || 'all',
        assignee: validatedFilters.assignee,
        creator: validatedFilters.creator,
        labels: validatedFilters.labels?.join(','),
        milestone: validatedFilters.milestone,
        sort: validatedFilters.sortBy || 'created',
        direction: validatedFilters.sortOrder || 'desc',
        per_page: validatedFilters.limit || 30,
        page: validatedFilters.page || 1
      });
      
      // Transform to domain models
      const tasks: Task[] = await Promise.all(
        githubIssues.map(async (issue) => {
          const metadata = await this.getTaskMetadata(issue.id.toString());
          
          return {
            id: issue.id.toString(),
            number: issue.number,
            title: issue.title,
            description: issue.body,
            state: issue.state as 'open' | 'closed',
            assignees: issue.assignees.map(a => a.login),
            labels: issue.labels.map(l => l.name),
            milestone: issue.milestone ? {
              id: issue.milestone.id.toString(),
              title: issue.milestone.title,
              number: issue.milestone.number
            } : undefined,
            priority: this.extractPriority(issue.labels.map(l => l.name)),
            complexity: this.extractComplexity(issue.labels.map(l => l.name)),
            estimatedHours: this.extractEstimatedHours(issue.body),
            dueDate: this.extractDueDate(issue.body),
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
            url: issue.html_url,
            creator: issue.user.login,
            metadata: {
              commentCount: issue.comments,
              reactionCount: this.calculateReactionCount(issue.reactions),
              linkedPRs: 0,
              statusHistory: metadata.statusHistory || []
            }
          };
        })
      );
      
      // Apply additional client-side filters
      let filteredTasks = tasks;
      
      if (validatedFilters.priority) {
        filteredTasks = filteredTasks.filter(task => task.priority === validatedFilters.priority);
      }
      
      if (validatedFilters.complexity) {
        const { min, max } = validatedFilters.complexity;
        filteredTasks = filteredTasks.filter(task => {
          return (!min || task.complexity >= min) && (!max || task.complexity <= max);
        });
      }
      
      if (validatedFilters.search) {
        const searchTerm = validatedFilters.search.toLowerCase();
        filteredTasks = filteredTasks.filter(task => 
          task.title.toLowerCase().includes(searchTerm) ||
          task.description?.toLowerCase().includes(searchTerm)
        );
      }
      
      // Generate summary
      const summary = this.generateTaskSummary(filteredTasks);
      
      const limit = validatedFilters.limit || 30;
      const page = validatedFilters.page || 1;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedTasks = filteredTasks.slice(startIndex, endIndex);
      
      return {
        tasks: paginatedTasks,
        total: filteredTasks.length,
        page,
        limit,
        hasMore: endIndex < filteredTasks.length,
        summary
      };
    } catch (error) {
      logger.error('Failed to list tasks', { filters, error });
      
      if (error instanceof ValidationError || error instanceof ServiceError) {
        throw error;
      }
      
      throw new ServiceError(
        'Failed to list tasks',
        'TASK_LIST_ERROR',
        { filters, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async createTaskDependency(fromTaskId: string, toTaskId: string, type: 'blocks' | 'depends_on' | 'relates_to', description?: string): Promise<TaskDependency> {
    try {
      const dependency: TaskDependency = {
        id: `${fromTaskId}_${toTaskId}_${type}`,
        fromTaskId,
        toTaskId,
        type,
        description,
        createdAt: new Date().toISOString(),
        createdBy: 'system' // Would be actual user
      };
      
      // Store dependency
      await fileSystem.writeFile(
        `tasks/dependencies/${dependency.id}.json`,
        dependency
      );
      
      // Update task metadata
      await this.updateTaskDependencies(fromTaskId);
      await this.updateTaskDependencies(toTaskId);
      
      logger.info('Task dependency created', { dependency });
      
      return dependency;
    } catch (error) {
      throw new ServiceError(
        'Failed to create task dependency',
        'TASK_DEPENDENCY_ERROR',
        { fromTaskId, toTaskId, type, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getTaskMetrics(id: string): Promise<TaskMetrics> {
    try {
      const task = await this.getTask(id);
      const metadata = await this.getTaskMetadata(id);
      
      // Calculate metrics based on task history and metadata
      const metrics: TaskMetrics = {
        taskId: id,
        metrics: {
          timeInState: this.calculateTimeInState(metadata.statusHistory),
          assigneeChanges: this.countAssigneeChanges(metadata.statusHistory),
          priorityChanges: 0, // Would be calculated from history
          commentActivity: task.metadata.commentCount,
          collaboratorCount: new Set(task.assignees).size
        },
        velocity: {
          actualVsEstimated: task.actualHours && task.estimatedHours 
            ? task.actualHours / task.estimatedHours 
            : 1,
          cycleTime: this.calculateCycleTime(metadata.statusHistory)
        },
        quality: {
          bugCount: 0, // Would be calculated based on linked issues/PRs
          reworkTime: 0 // Would be calculated based on status history
        }
      };
      
      return metrics;
    } catch (error) {
      throw new ServiceError(
        `Failed to get task metrics: ${id}`,
        'TASK_METRICS_ERROR',
        { taskId: id, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async getTaskMetadata(taskId: string): Promise<any> {
    try {
      const metadataExists = await fileSystem.exists(`tasks/${taskId}/metadata.json`);
      if (metadataExists) {
        return await fileSystem.readFileAsJSON(`tasks/${taskId}/metadata.json`);
      }
      return { statusHistory: [] };
    } catch (error) {
      return { statusHistory: [] };
    }
  }

  private async cacheTaskMetadata(task: Task): Promise<void> {
    await cache.set(`task:${task.id}`, task, 180000); // 3 minutes
    
    await fileSystem.writeFile(
      `tasks/${task.id}/metadata.json`,
      {
        id: task.id,
        title: task.title,
        lastCached: new Date().toISOString(),
        statusHistory: task.metadata.statusHistory,
        metrics: {
          complexity: task.complexity,
          priority: task.priority,
          estimatedHours: task.estimatedHours,
          actualHours: task.actualHours
        }
      },
      { atomic: true }
    );
  }

  private async initializeTaskTracking(task: Task): Promise<void> {
    const trackingData = {
      id: task.id,
      createdAt: task.createdAt,
      initialState: task.state,
      initialAssignees: task.assignees,
      tracking: {
        stateChanges: task.metadata.statusHistory,
        timeSpent: 0,
        estimationAccuracy: null
      }
    };
    
    await fileSystem.writeFile(
      `tasks/${task.id}/tracking.json`,
      trackingData
    );
  }

  private async updateTaskTracking(task: Task, previousTask: Task): Promise<void> {
    try {
      const trackingData = await fileSystem.readFileAsJSON(`tasks/${task.id}/tracking.json`);
      
      // Update tracking with changes
      trackingData.lastUpdated = new Date().toISOString();
      trackingData.tracking.stateChanges = task.metadata.statusHistory;
      
      await fileSystem.writeFile(
        `tasks/${task.id}/tracking.json`,
        trackingData
      );
    } catch (error) {
      logger.warn('Failed to update task tracking', { taskId: task.id, error });
    }
  }

  private async updateTaskDependencies(taskId: string): Promise<void> {
    // Implementation would update task dependency graph
    logger.debug('Updating task dependencies', { taskId });
  }

  private async executeAutomations(event: string, data: any): Promise<void> {
    const relevantAutomations = Array.from(this.automations.values())
      .filter(automation => automation.enabled && automation.trigger.event === event);
    
    for (const automation of relevantAutomations) {
      try {
        await this.executeAutomation(automation, data);
      } catch (error) {
        logger.warn('Automation execution failed', { automationId: automation.id, error });
      }
    }
  }

  private async executeAutomation(automation: TaskAutomation, data: any): Promise<void> {
    logger.debug('Executing automation', { automationId: automation.id });
    
    // Check conditions
    const conditionsMet = this.evaluateConditions(automation.trigger.conditions, data);
    if (!conditionsMet) {
      return;
    }
    
    // Execute actions
    for (const action of automation.actions) {
      await this.executeAction(action, data);
    }
    
    // Update automation execution stats
    automation.executionCount++;
    automation.lastExecuted = new Date().toISOString();
  }

  private evaluateConditions(conditions: Record<string, any>, data: any): boolean {
    // Implementation would evaluate automation conditions
    return true;
  }

  private async executeAction(action: { type: string; parameters: Record<string, any> }, data: any): Promise<void> {
    // Implementation would execute automation actions
    logger.debug('Executing automation action', { actionType: action.type });
  }

  private initializeDefaultWorkflows(): void {
    const defaultWorkflow: TaskWorkflow = {
      id: 'default',
      name: 'Default Task Workflow',
      states: [
        { id: 'backlog', name: 'Backlog', description: 'Task is in backlog', color: '#gray' },
        { id: 'ready', name: 'Ready', description: 'Task is ready for work', color: '#blue' },
        { id: 'in_progress', name: 'In Progress', description: 'Task is being worked on', color: '#yellow' },
        { id: 'review', name: 'Review', description: 'Task is under review', color: '#orange' },
        { id: 'done', name: 'Done', description: 'Task is completed', color: '#green' }
      ],
      transitions: [
        { from: 'backlog', to: 'ready' },
        { from: 'ready', to: 'in_progress' },
        { from: 'in_progress', to: 'review' },
        { from: 'review', to: 'done' },
        { from: 'review', to: 'in_progress' }, // Rework
        { from: 'in_progress', to: 'ready' }, // Put back
      ],
      defaultState: 'backlog',
      finalStates: ['done']
    };
    
    this.workflows.set('default', defaultWorkflow);
  }

  private extractPriority(labels: string[]): 'low' | 'medium' | 'high' | 'critical' {
    if (labels.includes('priority:critical')) return 'critical';
    if (labels.includes('priority:high')) return 'high';
    if (labels.includes('priority:low')) return 'low';
    return 'medium';
  }

  private extractComplexity(labels: string[]): number {
    const complexityLabel = labels.find(label => label.startsWith('complexity:'));
    if (complexityLabel) {
      const complexity = parseInt(complexityLabel.split(':')[1]);
      return isNaN(complexity) ? 1 : Math.max(1, Math.min(10, complexity));
    }
    return 1;
  }

  private extractEstimatedHours(body?: string): number | undefined {
    if (!body) return undefined;
    const match = body.match(/Estimated Hours?:\s*(\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }

  private extractDueDate(body?: string): string | undefined {
    if (!body) return undefined;
    const match = body.match(/Due Date?:\s*(\d{4}-\d{2}-\d{2})/i);
    return match ? match[1] : undefined;
  }

  private calculateReactionCount(reactions: any): number {
    if (!reactions) return 0;
    return Object.values(reactions).reduce((sum: number, count) => sum + (count as number), 0);
  }

  private enrichDescription(originalDescription: string = '', metadata: any): string {
    let enriched = originalDescription;
    
    if (metadata.priority) {
      enriched += `\n\n**Priority:** ${metadata.priority}`;
    }
    
    if (metadata.complexity) {
      enriched += `\n**Complexity:** ${metadata.complexity}/10`;
    }
    
    if (metadata.estimatedHours) {
      enriched += `\n**Estimated Hours:** ${metadata.estimatedHours}`;
    }
    
    if (metadata.dueDate) {
      enriched += `\n**Due Date:** ${metadata.dueDate}`;
    }
    
    return enriched;
  }

  private generateAutomaticLabels(data: CreateIssueRequest): string[] {
    const labels: string[] = [];
    
    if (data.priority) {
      labels.push(`priority:${data.priority}`);
    }
    
    if (data.complexity) {
      labels.push(`complexity:${data.complexity}`);
    }
    
    return labels;
  }

  private generateTaskSummary(tasks: Task[]): TaskList['summary'] {
    const summary: TaskList['summary'] = {
      byState: {},
      byPriority: {},
      byAssignee: {},
      averageComplexity: 0,
      totalEstimatedHours: 0
    };
    
    tasks.forEach(task => {
      // Count by state
      summary.byState[task.state] = (summary.byState[task.state] || 0) + 1;
      
      // Count by priority
      summary.byPriority[task.priority] = (summary.byPriority[task.priority] || 0) + 1;
      
      // Count by assignee
      task.assignees.forEach(assignee => {
        summary.byAssignee[assignee] = (summary.byAssignee[assignee] || 0) + 1;
      });
      
      // Add to totals
      summary.totalEstimatedHours += task.estimatedHours || 0;
    });
    
    // Calculate average complexity
    if (tasks.length > 0) {
      summary.averageComplexity = tasks.reduce((sum, task) => sum + task.complexity, 0) / tasks.length;
    }
    
    return summary;
  }

  private calculateChanges(oldTask: Task, newTask: Task): Record<string, any> {
    const changes: Record<string, any> = {};
    
    if (oldTask.title !== newTask.title) {
      changes.title = { from: oldTask.title, to: newTask.title };
    }
    
    if (oldTask.state !== newTask.state) {
      changes.state = { from: oldTask.state, to: newTask.state };
    }
    
    if (JSON.stringify(oldTask.assignees) !== JSON.stringify(newTask.assignees)) {
      changes.assignees = { from: oldTask.assignees, to: newTask.assignees };
    }
    
    if (oldTask.priority !== newTask.priority) {
      changes.priority = { from: oldTask.priority, to: newTask.priority };
    }
    
    return changes;
  }

  private calculateTimeInState(statusHistory: TaskStatusChange[]): Record<string, number> {
    const timeInState: Record<string, number> = {};
    
    for (let i = 0; i < statusHistory.length - 1; i++) {
      const current = statusHistory[i];
      const next = statusHistory[i + 1];
      
      const timeSpent = new Date(next.changedAt).getTime() - new Date(current.changedAt).getTime();
      const hours = timeSpent / (1000 * 60 * 60);
      
      timeInState[current.to] = (timeInState[current.to] || 0) + hours;
    }
    
    return timeInState;
  }

  private countAssigneeChanges(statusHistory: TaskStatusChange[]): number {
    return statusHistory.filter(change => change.from.includes('assignee')).length;
  }

  private calculateCycleTime(statusHistory: TaskStatusChange[]): number {
    const firstActive = statusHistory.find(change => change.to === 'in_progress');
    const lastDone = statusHistory.findLast(change => change.to === 'done');
    
    if (!firstActive || !lastDone) {
      return 0;
    }
    
    const cycleTime = new Date(lastDone.changedAt).getTime() - new Date(firstActive.changedAt).getTime();
    return cycleTime / (1000 * 60 * 60); // Convert to hours
  }

  private async emitEvent(eventType: string, data: any): Promise<void> {
    // Event emission would be handled by an event bus
    logger.debug('Emitting task event', { eventType, data });
    
    // Store event for audit trail
    await fileSystem.writeFile(
      `events/tasks/${Date.now()}_${eventType.replace('.', '_')}.json`,
      {
        type: eventType,
        timestamp: new Date().toISOString(),
        data
      }
    );
  }
}

// Singleton instance
export const taskService = new TaskService();