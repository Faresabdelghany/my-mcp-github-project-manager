import { z } from 'zod';
import { 
  TitleSchema, 
  DescriptionSchema, 
  StateSchema,
  DateStringSchema,
  OptionalDateStringSchema 
} from '@/utils/validation.js';

// Base project schemas
export const ProjectIdSchema = z.string().min(1, 'Project ID is required');
export const ProjectNumberSchema = z.number().positive('Project number must be positive');

// Create project schema
export const CreateProjectSchema = z.object({
  title: TitleSchema,
  shortDescription: DescriptionSchema.optional(),
  owner: z.string().min(1, 'Owner is required'),
  visibility: z.enum(['private', 'public'], {
    errorMap: () => ({ message: 'Visibility must be either private or public' })
  })
});

export type CreateProjectRequest = z.infer<typeof CreateProjectSchema>;

// List projects schema
export const ListProjectsSchema = z.object({
  status: z.enum(['active', 'closed', 'all']).default('all'),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 100)
});

export type ListProjectsRequest = z.infer<typeof ListProjectsSchema>;

// Get project schema
export const GetProjectSchema = z.object({
  projectId: ProjectIdSchema,
  includeItems: z.boolean().default(false)
});

export type GetProjectRequest = z.infer<typeof GetProjectSchema>;

// Update project schema
export const UpdateProjectSchema = z.object({
  projectId: ProjectIdSchema,
  title: TitleSchema.optional(),
  description: DescriptionSchema.optional(),
  status: z.enum(['active', 'closed']).optional(),
  visibility: z.enum(['private', 'public']).optional()
});

export type UpdateProjectRequest = z.infer<typeof UpdateProjectSchema>;

// Delete project schema
export const DeleteProjectSchema = z.object({
  projectId: ProjectIdSchema
});

export type DeleteProjectRequest = z.infer<typeof DeleteProjectSchema>;

// Project field schemas
export const CreateProjectFieldSchema = z.object({
  projectId: ProjectIdSchema,
  name: z.string().min(1, 'Field name is required'),
  type: z.enum(['text', 'number', 'date', 'single_select', 'iteration', 'milestone', 'assignees', 'labels']),
  description: DescriptionSchema.optional(),
  required: z.boolean().default(false),
  options: z.array(z.object({
    name: z.string().min(1, 'Option name is required'),
    description: DescriptionSchema.optional(),
    color: z.string().optional()
  })).optional()
});

export type CreateProjectFieldRequest = z.infer<typeof CreateProjectFieldSchema>;

// Project view schemas
export const CreateProjectViewSchema = z.object({
  projectId: ProjectIdSchema,
  name: z.string().min(1, 'View name is required'),
  layout: z.enum(['board', 'table', 'timeline', 'roadmap'])
});

export type CreateProjectViewRequest = z.infer<typeof CreateProjectViewSchema>;

// Project item schemas
export const AddProjectItemSchema = z.object({
  projectId: ProjectIdSchema,
  contentId: z.string().min(1, 'Content ID is required'),
  contentType: z.enum(['issue', 'pull_request'])
});

export type AddProjectItemRequest = z.infer<typeof AddProjectItemSchema>;

// Set field value schema
export const SetFieldValueSchema = z.object({
  projectId: ProjectIdSchema,
  itemId: z.string().min(1, 'Item ID is required'),
  fieldId: z.string().min(1, 'Field ID is required'),
  value: z.string().min(1, 'Value is required')
});

export type SetFieldValueRequest = z.infer<typeof SetFieldValueSchema>;
