import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/types";
import { isValidDateOnly } from "@/lib/tasks/due-date";

export const LIMITS = {
  title: 200,
  description: 5000,
  labels: 5,
  label: 24,
  search: 100,
} as const;

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid identifier")
  .transform((v) => v.toLowerCase());

export const statusSchema = z.enum(TASK_STATUSES, { error: "Status must be todo, in_progress or done" });
export const prioritySchema = z.enum(TASK_PRIORITIES, { error: "Priority must be low, medium or high" });

export const titleSchema = z
  .string({ error: "Title is required" })
  .trim()
  .min(1, "Title can't be empty")
  .max(LIMITS.title, `Title must be ${LIMITS.title} characters or fewer`);

export const descriptionSchema = z
  .string()
  .trim()
  .max(LIMITS.description, `Description must be ${LIMITS.description} characters or fewer`);

/** "YYYY-MM-DD" or null; an empty string is treated as "no due date". */
export const dueDateSchema = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .refine(isValidDateOnly, "Due date must be a valid date (YYYY-MM-DD)")
    .nullable(),
);

export const labelsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Labels can't be empty")
      .max(LIMITS.label, `Labels must be ${LIMITS.label} characters or fewer`),
  )
  .max(LIMITS.labels, `Use at most ${LIMITS.labels} labels`)
  .transform((labels) => {
    // De-duplicate case-insensitively, keeping the first spelling.
    const seen = new Set<string>();
    return labels.filter((l) => {
      const k = l.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });

export const assigneeIdSchema = objectIdSchema.nullable();

export const clientRequestIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/, "Invalid request id");

export const createTaskSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.default(""),
  status: statusSchema.default("todo"),
  priority: prioritySchema.default("medium"),
  dueDate: dueDateSchema.default(null),
  labels: labelsSchema.default([]),
  assigneeId: assigneeIdSchema.default(null),
  clientRequestId: clientRequestIdSchema.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const placementSchema = z.strictObject({
  prevId: objectIdSchema.nullable(),
  nextId: objectIdSchema.nullable(),
});
export type Placement = z.infer<typeof placementSchema>;

export const updateTaskSchema = z
  .strictObject({
    version: z.number({ error: "version is required" }).int().min(1),
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    dueDate: dueDateSchema.optional(),
    labels: labelsSchema.optional(),
    assigneeId: assigneeIdSchema.optional(),
    placement: placementSchema.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "version"), {
    message: "Nothing to update",
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z.strictObject({
  q: z.string().trim().max(LIMITS.search).optional(),
  priority: prioritySchema.optional(),
  status: statusSchema.optional(),
  assignee: z.union([z.literal("unassigned"), objectIdSchema]).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const deleteTaskQuerySchema = z.strictObject({
  version: z.coerce.number().int().min(1).optional(),
});
