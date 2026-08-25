import { z } from 'zod';

export const HEALTH_CONTRACT_VERSION = 1;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
  contractVersion: z.literal(HEALTH_CONTRACT_VERSION)
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).optional()
});
export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().uuid()
});
export const artifactResponseSchema = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), taskId: z.string().uuid(), runId: z.string().uuid().nullable(), title: z.string(), mimeType: z.string(), status: z.enum(['DRAFT', 'READY', 'SUPERSEDED']), createdAt: z.string().datetime()
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const OFFICE_EVENT_SCHEMA_VERSION = 1;
export const officeEventSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), projectId: z.string().uuid(), sequence: z.number().int().positive(), type: z.string().min(1).max(100), occurredAt: z.string().datetime(), correlationId: z.string().uuid(), schemaVersion: z.literal(OFFICE_EVENT_SCHEMA_VERSION), payload: z.record(z.string(), z.unknown())
});
export type OfficeEvent = z.infer<typeof officeEventSchema>;
