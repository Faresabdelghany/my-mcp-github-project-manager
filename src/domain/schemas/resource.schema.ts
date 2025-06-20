import { z } from 'zod';
import { 
  TitleSchema, 
  DescriptionSchema, 
  DateStringSchema,
  OptionalDateStringSchema,
  EmailSchema,
  PositiveIntegerSchema,
  NonNegativeIntegerSchema
} from '@/utils/validation.js';

// Base resource schemas
export const ResourceIdSchema = z.string().min(1, 'Resource ID is required');
export const TeamMemberIdSchema = z.string().min(1, 'Team member ID is required');

// Resource types enum
export const ResourceTypeSchema = z.enum([
  'team_member',
  'api_quota',
  'infrastructure',
  'time_allocation',
  'budget',
  'dependency'
]);

// Skill level enum
export const SkillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);

// Team member resource schema
export const TeamMemberResourceSchema = z.object({
  id: TeamMemberIdSchema,
  name: z.string().min(1, 'Name is required'),
  email: EmailSchema,
  githubUsername: z.string().min(1, 'GitHub username is required'),
  role: z.enum(['developer', 'designer', 'manager', 'qa', 'devops', 'analyst']),
  skills: z.array(z.object({
    name: z.string().min(1, 'Skill name is required'),
    level: SkillLevelSchema,
    yearsExperience: NonNegativeIntegerSchema.optional()
  })),
  capacity: z.object({
    hoursPerWeek: PositiveIntegerSchema.max(168, 'Cannot exceed 168 hours per week'),
    availableFrom: DateStringSchema,
    availableTo: OptionalDateStringSchema,
    currentUtilization: z.number().min(0).max(100).default(0), // percentage
    preferredWorkload: z.number().min(0).max(100).default(100) // percentage
  }),
  timezone: z.string().default('UTC'),
  status: z.enum(['active', 'inactive', 'on_leave', 'busy']).default('active')
});

export type TeamMemberResource = z.infer<typeof TeamMemberResourceSchema>;

// Resource allocation schema
export const ResourceAllocationSchema = z.object({
  resourceId: ResourceIdSchema,
  projectId: z.string().optional(),
  issueNumber: z.number().optional(),
  milestoneId: z.string().optional(),
  allocationType: z.enum(['assignment', 'collaboration', 'review', 'support']),
  hoursAllocated: PositiveIntegerSchema,
  startDate: DateStringSchema,
  endDate: OptionalDateStringSchema,
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).default('planned'),
  notes: DescriptionSchema.optional()
});

export type ResourceAllocation = z.infer<typeof ResourceAllocationSchema>;

// Create resource allocation request
export const CreateResourceAllocationSchema = z.object({
  resourceId: ResourceIdSchema,
  projectId: z.string().optional(),
  issueNumber: z.number().optional(),
  milestoneId: z.string().optional(),
  allocationType: z.enum(['assignment', 'collaboration', 'review', 'support']),
  hoursAllocated: PositiveIntegerSchema,
  startDate: DateStringSchema,
  endDate: OptionalDateStringSchema,
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  notes: DescriptionSchema.optional(),
  skillsRequired: z.array(z.string()).optional(),
  autoOptimize: z.boolean().default(false)
});

export type CreateResourceAllocationRequest = z.infer<typeof CreateResourceAllocationSchema>;

// Update resource allocation schema
export const UpdateResourceAllocationSchema = z.object({
  allocationId: z.string().min(1, 'Allocation ID is required'),
  hoursAllocated: PositiveIntegerSchema.optional(),
  startDate: DateStringSchema.optional(),
  endDate: OptionalDateStringSchema.optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).optional(),
  notes: DescriptionSchema.optional()
});

export type UpdateResourceAllocationRequest = z.infer<typeof UpdateResourceAllocationSchema>;

// Resource utilization query schema
export const ResourceUtilizationQuerySchema = z.object({
  resourceId: ResourceIdSchema.optional(),
  resourceType: ResourceTypeSchema.optional(),
  projectId: z.string().optional(),
  startDate: DateStringSchema.optional(),
  endDate: DateStringSchema.optional(),
  includeForecasting: z.boolean().default(false),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('weekly')
});

export type ResourceUtilizationQuery = z.infer<typeof ResourceUtilizationQuerySchema>;

// Workload balancing schema
export const WorkloadBalancingSchema = z.object({
  teamMemberIds: z.array(TeamMemberIdSchema).optional(),
  projectId: z.string().optional(),
  targetUtilization: z.number().min(0).max(100).default(80),
  balancingStrategy: z.enum(['even_distribution', 'skill_based', 'priority_based', 'availability_based']).default('skill_based'),
  considerSkillMatch: z.boolean().default(true),
  considerPreferences: z.boolean().default(true),
  maxReallocation: z.number().min(0).max(100).default(25), // max percentage of workload to reallocate
  dryRun: z.boolean().default(false)
});

export type WorkloadBalancingRequest = z.infer<typeof WorkloadBalancingSchema>;

// Capacity tracking schema
export const CapacityTrackingSchema = z.object({
  teamMemberIds: z.array(TeamMemberIdSchema).optional(),
  startDate: DateStringSchema.optional(),
  endDate: DateStringSchema.optional(),
  includeProjections: z.boolean().default(true),
  includeBurndownChart: z.boolean().default(false),
  alertThreshold: z.number().min(0).max(100).default(90) // alert when utilization exceeds this percentage
});

export type CapacityTrackingRequest = z.infer<typeof CapacityTrackingSchema>;

// API limits monitoring schema
export const ApiLimitsMonitoringSchema = z.object({
  includeHistory: z.boolean().default(false),
  timeRange: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  includeProjections: z.boolean().default(true),
  alertThreshold: z.number().min(0).max(100).default(80) // alert when usage exceeds this percentage
});

export type ApiLimitsMonitoringRequest = z.infer<typeof ApiLimitsMonitoringSchema>;

// Conflict resolution schema
export const ConflictResolutionSchema = z.object({
  conflictType: z.enum(['overallocation', 'skill_mismatch', 'timeline_conflict', 'priority_conflict']),
  resourceIds: z.array(ResourceIdSchema).optional(),
  projectIds: z.array(z.string()).optional(),
  resolutionStrategy: z.enum(['automatic', 'suggest_only', 'manual_review']).default('suggest_only'),
  considerAlternatives: z.boolean().default(true),
  maxImpact: z.enum(['low', 'medium', 'high']).default('medium'), // maximum impact level for suggested changes
  dryRun: z.boolean().default(true)
});

export type ConflictResolutionRequest = z.infer<typeof ConflictResolutionSchema>;

// Team member management schemas
export const CreateTeamMemberSchema = TeamMemberResourceSchema.omit({ id: true });
export type CreateTeamMemberRequest = z.infer<typeof CreateTeamMemberSchema>;

export const UpdateTeamMemberSchema = z.object({
  id: TeamMemberIdSchema,
  name: z.string().min(1, 'Name is required').optional(),
  email: EmailSchema.optional(),
  githubUsername: z.string().min(1, 'GitHub username is required').optional(),
  role: z.enum(['developer', 'designer', 'manager', 'qa', 'devops', 'analyst']).optional(),
  skills: z.array(z.object({
    name: z.string().min(1, 'Skill name is required'),
    level: SkillLevelSchema,
    yearsExperience: NonNegativeIntegerSchema.optional()
  })).optional(),
  capacity: z.object({
    hoursPerWeek: PositiveIntegerSchema.max(168, 'Cannot exceed 168 hours per week'),
    availableFrom: DateStringSchema,
    availableTo: OptionalDateStringSchema,
    currentUtilization: z.number().min(0).max(100).default(0),
    preferredWorkload: z.number().min(0).max(100).default(100)
  }).optional(),
  timezone: z.string().optional(),
  status: z.enum(['active', 'inactive', 'on_leave', 'busy']).optional()
});

export type UpdateTeamMemberRequest = z.infer<typeof UpdateTeamMemberSchema>;

// Resource search and filtering
export const ResourceSearchSchema = z.object({
  query: z.string().optional(),
  resourceType: ResourceTypeSchema.optional(),
  skills: z.array(z.string()).optional(),
  availability: z.object({
    startDate: DateStringSchema,
    endDate: DateStringSchema,
    minHours: PositiveIntegerSchema.optional()
  }).optional(),
  utilizationRange: z.object({
    min: z.number().min(0).max(100).default(0),
    max: z.number().min(0).max(100).default(100)
  }).optional(),
  roles: z.array(z.enum(['developer', 'designer', 'manager', 'qa', 'devops', 'analyst'])).optional(),
  status: z.array(z.enum(['active', 'inactive', 'on_leave', 'busy'])).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

export type ResourceSearchRequest = z.infer<typeof ResourceSearchSchema>;
