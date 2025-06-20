import { z } from 'zod';
import { 
  TitleSchema, 
  DescriptionSchema, 
  StateSchema,
  DateStringSchema,
  OptionalDateStringSchema 
} from '@/utils/validation.js';

// Base milestone schemas
export const MilestoneIdSchema = z.number().positive('Milestone ID must be positive');
export const MilestoneNumberSchema = z.number().positive('Milestone number must be positive');

// Create milestone schema
export const CreateMilestoneSchema = z.object({
  title: TitleSchema,
  description: DescriptionSchema,
  dueDate: OptionalDateStringSchema
});

export type CreateMilestoneRequest = z.infer<typeof CreateMilestoneSchema>;

// List milestones schema
export const ListMilestonesSchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  sort: z.enum(['due_on', 'completeness']).default('due_on'),
  direction: z.enum(['asc', 'desc']).default('asc')
});

export type ListMilestonesRequest = z.infer<typeof ListMilestonesSchema>;

// Update milestone schema
export const UpdateMilestoneSchema = z.object({
  milestoneId: z.string().min(1, 'Milestone ID is required'),
  title: TitleSchema.optional(),
  description: DescriptionSchema.optional(),
  dueDate: z.string().min(1, 'Due date is required'),
  state: z.enum(['open', 'closed']).optional()
});

export type UpdateMilestoneRequest = z.infer<typeof UpdateMilestoneSchema>;

// Delete milestone schema
export const DeleteMilestoneSchema = z.object({
  milestoneId: z.string().min(1, 'Milestone ID is required')
});

export type DeleteMilestoneRequest = z.infer<typeof DeleteMilestoneSchema>;

// Get milestone schema
export const GetMilestoneSchema = z.object({
  milestoneId: z.string().min(1, 'Milestone ID is required')
});

export type GetMilestoneRequest = z.infer<typeof GetMilestoneSchema>;

// Bulk operations schemas
export const BulkDeleteMilestonesSchema = z.object({
  milestoneNumbers: z.array(MilestoneNumberSchema).min(1, 'At least one milestone required').max(10, 'Too many milestones'),
  confirm: z.boolean().refine(val => val === true, {
    message: 'Bulk delete requires confirmation'
  })
});

export type BulkDeleteMilestonesRequest = z.infer<typeof BulkDeleteMilestonesSchema>;

// Milestone metrics schemas
export const MilestoneMetricsSchema = z.object({
  milestoneId: z.string().min(1, 'Milestone ID is required'),
  includeIssues: z.boolean().default(false)
});

export type MilestoneMetricsRequest = z.infer<typeof MilestoneMetricsSchema>;

// Overdue milestones schema
export const OverdueMilestonesSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
  includeIssues: z.boolean().default(false)
});

export type OverdueMilestonesRequest = z.infer<typeof OverdueMilestonesSchema>;

// Upcoming milestones schema
export const UpcomingMilestonesSchema = z.object({
  daysAhead: z.number().min(1).max(365).default(30),
  limit: z.number().min(1).max(50).default(10),
  includeIssues: z.boolean().default(false)
});

export type UpcomingMilestonesRequest = z.infer<typeof UpcomingMilestonesSchema>;
