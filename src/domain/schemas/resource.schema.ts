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

// Additional schemas continue...
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
  maxReallocation: z.number().min(0).max(100).default(25),
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
  alertThreshold: z.number().min(0).max(100).default(90)
});

export type CapacityTrackingRequest = z.infer<typeof CapacityTrackingSchema>;

// API limits monitoring schema
export const ApiLimitsMonitoringSchema = z.object({
  includeHistory: z.boolean().default(false),
  timeRange: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  includeProjections: z.boolean().default(true),
  alertThreshold: z.number().min(0).max(100).default(80)
});

export type ApiLimitsMonitoringRequest = z.infer<typeof ApiLimitsMonitoringSchema>;