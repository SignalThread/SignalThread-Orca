import { z } from "zod";
import { TIMELINE_PLANNING_STAGES, TIMELINE_WORKSTREAMS } from "@/lib/timeline/taxonomy";

export const TIMELINE_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "AT_RISK",
  "COMPLETE",
] as const;

export const TIMELINE_PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export const TIMELINE_DEPENDENCY_TYPES = ["FINISH_TO_START"] as const;
export const TIMELINE_ITEM_DISPOSITIONS = ["ACTIVE", "NOT_NEEDED"] as const;

export const TIMELINE_ORDER_BY_VALUES = ["due", "start", "end", "sortOrder"] as const;

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const timelineStatusSchema = z.enum(TIMELINE_STATUSES);
export const timelinePrioritySchema = z.enum(TIMELINE_PRIORITIES);
export const timelineDependencyTypeSchema = z.enum(TIMELINE_DEPENDENCY_TYPES);
export const timelineItemDispositionSchema = z.enum(TIMELINE_ITEM_DISPOSITIONS);
export const timelineOrderBySchema = z.enum(TIMELINE_ORDER_BY_VALUES);
export const timelineWorkstreamSchema = z.enum(TIMELINE_WORKSTREAMS);
export const timelinePlanningStageSchema = z.enum(TIMELINE_PLANNING_STAGES);
// Zero is a valid explicit progress value; null remains the canonical "not set".
export const timelineProgressSchema = z.number().int().min(0).max(100).nullable();

export const listTimelineItemsQuerySchema = z.object({
  status: timelineStatusSchema.optional(),
  department: z.string().trim().min(1).optional(),
  workstream: timelineWorkstreamSchema.optional(),
  planningStage: timelinePlanningStageSchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  priority: timelinePrioritySchema.optional(),
  disposition: timelineItemDispositionSchema.optional(),
  orderBy: timelineOrderBySchema.optional(),
});

const timelineItemFieldsSchema = z.object({
  kind: z.enum(["BAR", "MILESTONE"]).optional(),
  title: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  department: z.string().trim().min(1).max(120).nullable().optional(),
  workstream: timelineWorkstreamSchema.nullable().optional(),
  planningStage: timelinePlanningStageSchema.nullable().optional(),
  isCriticalPath: z.boolean().optional(),
  status: timelineStatusSchema.optional(),
  priority: timelinePrioritySchema.optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  milestoneDate: dateStringSchema.nullable().optional(),
  date: dateStringSchema.nullable().optional(),
  dueDate: dateStringSchema.nullable().optional(),
  startDate: dateStringSchema.nullable().optional(),
  endDate: dateStringSchema.nullable().optional(),
  progress: timelineProgressSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  disposition: timelineItemDispositionSchema.optional(),
  dispositionReason: z.string().trim().min(1).max(2000).nullable().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

function requireNotNeededReason(input: { disposition?: string; dispositionReason?: string | null }, context: z.RefinementCtx): void {
  if (input.disposition === "NOT_NEEDED" && !input.dispositionReason?.trim()) {
    context.addIssue({ code: "custom", path: ["dispositionReason"], message: "Not Needed requires a reason" });
  }
}

export const createTimelineItemSchema = timelineItemFieldsSchema.superRefine(requireNotNeededReason);

export const updateTimelineItemSchema = timelineItemFieldsSchema
  .partial()
  .superRefine(requireNotNeededReason)
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required",
  });

export const bulkUpdateTimelineItemSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(500),
  patch: z.object({
    department: z.string().trim().min(1).max(120).nullable().optional(),
    workstream: timelineWorkstreamSchema.nullable().optional(),
    planningStage: timelinePlanningStageSchema.nullable().optional(),
    status: timelineStatusSchema.optional(),
    priority: timelinePrioritySchema.optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    isCriticalPath: z.boolean().optional(),
    progress: timelineProgressSchema.optional(),
  }).strict().refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required",
  }),
});

export const bulkDeleteTimelineItemSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(500),
});

export const createTimelineDependencySchema = z.object({
  predecessorItemId: z.string().uuid(),
  successorItemId: z.string().uuid(),
  type: timelineDependencyTypeSchema.optional(),
});

export const deleteTimelineDependencySchema = z.object({
  id: z.string().uuid(),
});

export const reorderTimelineItemSchema = z.object({
  itemId: z.string().uuid(),
  direction: z.enum(["up", "down"]),
  expectedSortOrder: z.number().int().min(0),
});

export type TimelineStatus = z.infer<typeof timelineStatusSchema>;
export type TimelinePriority = z.infer<typeof timelinePrioritySchema>;
export type TimelineDependencyType = z.infer<typeof timelineDependencyTypeSchema>;
export type TimelineItemDisposition = z.infer<typeof timelineItemDispositionSchema>;
export type TimelineOrderBy = z.infer<typeof timelineOrderBySchema>;
export type ListTimelineItemsQuery = z.infer<typeof listTimelineItemsQuerySchema>;
export type CreateTimelineItemInput = z.infer<typeof createTimelineItemSchema>;
export type UpdateTimelineItemInput = z.infer<typeof updateTimelineItemSchema>;
export type BulkUpdateTimelineItemInput = z.infer<typeof bulkUpdateTimelineItemSchema>;
export type BulkDeleteTimelineItemInput = z.infer<typeof bulkDeleteTimelineItemSchema>;
export type CreateTimelineDependencyInput = z.infer<typeof createTimelineDependencySchema>;
export type DeleteTimelineDependencyInput = z.infer<typeof deleteTimelineDependencySchema>;
export type ReorderTimelineItemInput = z.infer<typeof reorderTimelineItemSchema>;
