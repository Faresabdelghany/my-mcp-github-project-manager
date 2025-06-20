import { z } from 'zod';
import { 
  TitleSchema, 
  DescriptionSchema, 
  StateSchema,
  LabelSchema,
  StringArraySchema,
  DateStringSchema 
} from '@/utils/validation.js';

// Base issue schemas
export const IssueIdSchema = z.number().positive('Issue ID must be positive');
export const IssueNumberSchema = z.number().positive('Issue number must be positive');

// Create issue schema
export const CreateIssueSchema = z.object({
  title: TitleSchema,
  description: DescriptionSchema,
  assignees: z.string().min(1, 'At least one assignee is required'),
  labels: z.string().min(1, 'At least one label is required'),
  milestoneId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  type: z.enum(['bug', 'feature', 'enhancement', 'documentation', 'question']).optional()
});

export type CreateIssueRequest = z.infer<typeof CreateIssueSchema>;

// List issues schema
export const ListIssuesSchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  assignee: z.string().optional(),
  labels: z.array(z.string()).optional(),
  milestone: z.string().optional(),
  sort: z.enum(['created', 'updated', 'comments']).default('created'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 30)
});

export type ListIssuesRequest = z.infer<typeof ListIssuesSchema>;

// Get issue schema
export const GetIssueSchema = z.object({
  issueId: z.string().min(1, 'Issue ID is required')
});

export type GetIssueRequest = z.infer<typeof GetIssueSchema>;

// Update issue schema
export const UpdateIssueSchema = z.object({
  issueId: z.string().min(1, 'Issue ID is required'),
  title: TitleSchema.optional(),
  description: DescriptionSchema.optional(),
  status: z.enum(['open', 'closed']).optional(),
  assignees: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  milestoneId: z.string().min(1, 'Milestone ID is required')
});

export type UpdateIssueRequest = z.infer<typeof UpdateIssueSchema>;

// Bulk operations schemas
export const BulkUpdateIssuesSchema = z.object({
  issueNumbers: z.array(IssueNumberSchema).min(1, 'At least one issue required').max(50, 'Too many issues'),
  updates: z.object({
    state: StateSchema.optional(),
    labels: StringArraySchema.optional(),
    assignees: StringArraySchema.optional(),
    milestone: z.number().optional()
  }),
  confirm: z.boolean().refine(val => val === true, {
    message: 'Bulk operations require confirmation'
  })
});

export type BulkUpdateIssuesRequest = z.infer<typeof BulkUpdateIssuesSchema>;

export const BulkCloseIssuesSchema = z.object({
  issueNumbers: z.array(IssueNumberSchema).min(1, 'At least one issue required').max(50, 'Too many issues'),
  closeReason: z.string().min(1, 'Close reason is required'),
  confirm: z.boolean().refine(val => val === true, {
    message: 'Bulk close requires confirmation'
  })
});

export type BulkCloseIssuesRequest = z.infer<typeof BulkCloseIssuesSchema>;

// Issue filtering and search schemas
export const IssueFilterSchema = z.object({
  state: StateSchema.optional(),
  labels: StringArraySchema.optional(),
  assignees: StringArraySchema.optional(),
  milestone: z.string().optional(),
  since: DateStringSchema.optional(),
  until: DateStringSchema.optional(),
  sort: z.enum(['created', 'updated', 'comments', 'priority']).default('created'),
  direction: z.enum(['asc', 'desc']).default('desc')
});

export type IssueFilterRequest = z.infer<typeof IssueFilterSchema>;

export const IssueSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: IssueFilterSchema.optional(),
  limit: z.number().min(1).max(100).default(30)
});

export type IssueSearchRequest = z.infer<typeof IssueSearchSchema>;
