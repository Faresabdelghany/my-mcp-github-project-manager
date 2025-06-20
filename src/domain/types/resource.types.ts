// Resource Management Types for GitHub Project Manager MCP

export interface ResourceBase {
  id: string;
  type: ResourceType;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  status: ResourceStatus;
}

export type ResourceType = 
  | 'team_member'
  | 'api_quota'
  | 'infrastructure'
  | 'time_allocation'
  | 'budget'
  | 'dependency';

export type ResourceStatus = 'active' | 'inactive' | 'on_leave' | 'busy';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type TeamMemberRole = 'developer' | 'designer' | 'manager' | 'qa' | 'devops' | 'analyst';
export type AllocationStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

// Team member skill interface
export interface Skill {
  name: string;
  level: SkillLevel;
  yearsExperience?: number;
  certifications?: string[];
  lastUsed?: string;
}

// Team member capacity interface
export interface Capacity {
  hoursPerWeek: number;
  availableFrom: string;
  availableTo?: string;
  currentUtilization: number; // percentage 0-100
  preferredWorkload: number; // percentage 0-100
  overtime: {
    maxHoursPerWeek: number;
    currentOvertimeHours: number;
  };
  workingHours: {
    startTime: string; // HH:MM format
    endTime: string; // HH:MM format
    workingDays: number[]; // 0-6, 0 = Sunday
  };
}

// Team member resource interface
export interface TeamMemberResource extends ResourceBase {
  type: 'team_member';
  email: string;
  githubUsername: string;
  role: TeamMemberRole;
  skills: Skill[];
  capacity: Capacity;
  timezone: string;
  preferences: {
    preferredProjects: string[];
    avoidProjects: string[];
    workStyle: 'collaborative' | 'independent' | 'mixed';
    communicationStyle: 'async' | 'sync' | 'mixed';
  };
  performance: {
    efficiency: number; // 0-100 scale
    qualityScore: number; // 0-100 scale
    collaborationRating: number; // 0-100 scale
    lastReviewDate?: string;
  };
}

// Resource allocation interface
export interface ResourceAllocation {
  id: string;
  resourceId: string;
  projectId?: string;
  issueNumber?: number;
  milestoneId?: string;
  allocationType: 'assignment' | 'collaboration' | 'review' | 'support';
  hoursAllocated: number;
  hoursUsed: number;
  startDate: string;
  endDate?: string;
  priority: Priority;
  status: AllocationStatus;
  notes?: string;
  skillsRequired?: string[];
  progress: {
    percentage: number;
    lastUpdated: string;
    estimatedCompletion?: string;
  };
  dependencies: string[]; // allocation IDs this depends on
}

// Resource utilization metrics
export interface ResourceUtilization {
  resourceId: string;
  period: {
    start: string;
    end: string;
    granularity: 'daily' | 'weekly' | 'monthly';
  };
  metrics: {
    totalHours: number;
    allocatedHours: number;
    utilizationPercentage: number;
    efficiency: number;
    overallocation: number;
  };
  breakdown: {
    projectId?: string;
    issueNumber?: number;
    hours: number;
    percentage: number;
  }[];
  trends: {
    utilizationTrend: 'increasing' | 'decreasing' | 'stable';
    efficiencyTrend: 'improving' | 'declining' | 'stable';
    projectedUtilization: number;
  };
}

// Workload balancing result
export interface WorkloadBalancingResult {
  strategy: 'even_distribution' | 'skill_based' | 'priority_based' | 'availability_based';
  recommendations: {
    resourceId: string;
    currentUtilization: number;
    targetUtilization: number;
    suggestedChanges: {
      allocationId: string;
      action: 'add' | 'remove' | 'modify';
      reason: string;
      impact: 'low' | 'medium' | 'high';
      hoursChange: number;
    }[];
  }[];
  summary: {
    totalResourcesAffected: number;
    averageUtilizationBefore: number;
    averageUtilizationAfter: number;
    improvementScore: number;
  };
  warnings: string[];
  conflicts: ResourceConflict[];
}

// Resource conflict interface
export interface ResourceConflict {
  id: string;
  type: 'overallocation' | 'skill_mismatch' | 'timeline_conflict' | 'priority_conflict';
  severity: 'low' | 'medium' | 'high' | 'critical';
  resourceIds: string[];
  description: string;
  impact: {
    affectedProjects: string[];
    delayEstimate?: number; // in hours
    qualityRisk: 'low' | 'medium' | 'high';
  };
  resolutionOptions: {
    id: string;
    description: string;
    effort: 'low' | 'medium' | 'high';
    tradeoffs: string[];
    automated: boolean;
  }[];
  createdAt: string;
  resolvedAt?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'ignored';
}

// Capacity forecast interface
export interface CapacityForecast {
  resourceId: string;
  forecastPeriod: {
    start: string;
    end: string;
  };
  projections: {
    date: string;
    utilizationPercentage: number;
    availableHours: number;
    confidence: number; // 0-100
  }[];
  scenarios: {
    optimistic: { averageUtilization: number; availableCapacity: number };
    realistic: { averageUtilization: number; availableCapacity: number };
    pessimistic: { averageUtilization: number; availableCapacity: number };
  };
  risks: {
    overallocationRisk: number; // 0-100
    burnoutRisk: number; // 0-100
    deliveryRisk: number; // 0-100
  };
  recommendations: string[];
}

// API limits status interface
export interface ApiLimitsStatus {
  service: string;
  currentUsage: {
    requests: number;
    remaining: number;
    resetTime: string;
    percentage: number;
  };
  hourly: {
    limit: number;
    used: number;
    remaining: number;
    resetTime: string;
  };
  daily: {
    limit: number;
    used: number;
    remaining: number;
    resetTime: string;
  };
  trends: {
    averageHourlyUsage: number;
    peakHourlyUsage: number;
    projectedDailyUsage: number;
  };
  alerts: {
    level: 'info' | 'warning' | 'critical';
    message: string;
    threshold: number;
    currentValue: number;
  }[];
  recommendations: {
    action: 'throttle' | 'queue' | 'cache' | 'optimize';
    description: string;
    priority: Priority;
  }[];
}

// Export all types
export type {
  ResourceBase,
  TeamMemberResource,
  ResourceAllocation,
  ResourceUtilization,
  WorkloadBalancingResult,
  ResourceConflict,
  CapacityForecast,
  ApiLimitsStatus,
  Skill,
  Capacity
};