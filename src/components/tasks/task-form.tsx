"use client";

import { z } from "zod";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PriorityIcon } from "@/components/board/task-meta";
import { MemberAvatar } from "@/components/board/member-avatar";
import { isValidDateOnly } from "@/lib/tasks/due-date";
import { LIMITS, prioritySchema, statusSchema, titleSchema } from "@/lib/validations/task";
import { PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES, type Member, type Task } from "@/types";
import type { TaskDraft } from "@/components/board/use-board";

const UNASSIGNED = "__none__";

export function parseLabels(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || seen.has(l.toLowerCase())) return false;
      seen.add(l.toLowerCase());
      return true;
    });
}

/** Form values are strings; they're converted to a TaskDraft on submit. */
export const taskFormSchema = z.object({
  title: titleSchema,
  description: z.string().max(LIMITS.description, `Description must be ${LIMITS.description} characters or fewer`),
  status: statusSchema,
  priority: prioritySchema,
  assigneeId: z.string(),
  dueDate: z.string().refine((v) => v === "" || isValidDateOnly(v), "Enter a valid date"),
  labels: z.string().superRefine((v, ctx) => {
    const labels = parseLabels(v);
    if (labels.length > LIMITS.labels) ctx.addIssue({ code: "custom", message: `Use at most ${LIMITS.labels} labels` });
    if (labels.some((l) => l.length > LIMITS.label)) {
      ctx.addIssue({ code: "custom", message: `Labels must be ${LIMITS.label} characters or fewer` });
    }
  }),
});
export type TaskFormValues = z.infer<typeof taskFormSchema>;

export function taskToFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ?? UNASSIGNED,
    dueDate: task.dueDate ?? "",
    labels: task.labels.join(", "),
  };
}

export function emptyFormValues(status: TaskFormValues["status"] = "todo"): TaskFormValues {
  return { title: "", description: "", status, priority: "medium", assigneeId: UNASSIGNED, dueDate: "", labels: "" };
}

export function formValuesToDraft(v: TaskFormValues): TaskDraft {
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    status: v.status,
    priority: v.priority,
    assigneeId: v.assigneeId === UNASSIGNED || v.assigneeId === "" ? null : v.assigneeId,
    dueDate: v.dueDate === "" ? null : v.dueDate,
    labels: parseLabels(v.labels),
  };
}

/** Maps server field paths (422 details) back onto form fields. */
export function applyServerErrors(form: UseFormReturn<TaskFormValues>, errors: Record<string, string>) {
  const fields: (keyof TaskFormValues)[] = ["title", "description", "status", "priority", "assigneeId", "dueDate", "labels"];
  let applied = false;
  for (const [path, message] of Object.entries(errors)) {
    const field = fields.find((f) => path === f || path.startsWith(`${f}.`));
    if (field) {
      form.setError(field, { message });
      applied = true;
    }
  }
  return applied;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

export function TaskFormFields({
  form,
  members,
  idPrefix,
  autoFocusTitle,
}: {
  form: UseFormReturn<TaskFormValues>;
  members: Member[];
  idPrefix: string;
  autoFocusTitle?: boolean;
}) {
  const { register, control, formState } = form;
  const e = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;
  const activeMembers = members.filter((m) => m.active);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={id("title")}>Title</Label>
        <Input
          id={id("title")}
          placeholder="What needs doing?"
          autoFocus={autoFocusTitle}
          autoComplete="off"
          maxLength={LIMITS.title + 50}
          aria-invalid={!!e.title}
          aria-describedby={e.title ? id("title-error") : undefined}
          {...register("title")}
        />
        <FieldError id={id("title-error")} message={e.title?.message} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={id("description")}>
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={id("description")}
          placeholder="Add a few details…"
          rows={4}
          className="max-h-60 resize-y"
          aria-invalid={!!e.description}
          aria-describedby={e.description ? id("description-error") : undefined}
          {...register("description")}
        />
        <FieldError id={id("description-error")} message={e.description?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={id("status")}>Status</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id("status")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("priority")}>Priority</Label>
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id("priority")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <PriorityIcon priority={p} />
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("assignee")}>Assignee</Label>
          <Controller
            control={control}
            name="assigneeId"
            render={({ field }) => (
              <Select value={field.value || UNASSIGNED} onValueChange={field.onChange}>
                <SelectTrigger id={id("assignee")} className="w-full" aria-invalid={!!e.assigneeId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <MemberAvatar member={m} size={18} />
                      {m.name}
                    </SelectItem>
                  ))}
                  {/* Keep a deactivated assignee selectable so editing doesn't silently unassign. */}
                  {field.value !== UNASSIGNED &&
                    !activeMembers.some((m) => m.id === field.value) &&
                    members
                      .filter((m) => m.id === field.value)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} (inactive)
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id={id("assignee-error")} message={e.assigneeId?.message} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("dueDate")}>Due date</Label>
          <Input
            id={id("dueDate")}
            type="date"
            min="1970-01-01"
            max="2999-12-31"
            aria-invalid={!!e.dueDate}
            aria-describedby={e.dueDate ? id("dueDate-error") : undefined}
            {...register("dueDate")}
          />
          <FieldError id={id("dueDate-error")} message={e.dueDate?.message} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={id("labels")}>
          Labels <span className="font-normal text-muted-foreground">(comma-separated)</span>
        </Label>
        <Input
          id={id("labels")}
          placeholder="design, backend"
          autoComplete="off"
          aria-invalid={!!e.labels}
          aria-describedby={e.labels ? id("labels-error") : undefined}
          {...register("labels")}
        />
        <FieldError id={id("labels-error")} message={e.labels?.message} />
      </div>
    </div>
  );
}
