"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActivity } from "@/hooks/use-activity";
import { useNow } from "@/hooks/use-now";
import { ApiError, fieldErrors, friendlyError } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import type { BoardEvent, Member, Task } from "@/types";
import type { TaskDraft, TaskPatch } from "@/components/board/use-board";
import { DeleteTaskDialog } from "./delete-task-dialog";
import { EventList, mergeEvents } from "./task-history";
import { applyServerErrors, formValuesToDraft, taskFormSchema, TaskFormFields, taskToFormValues, type TaskFormValues } from "./task-form";

export function diffTask(task: Task, draft: TaskDraft): TaskPatch {
  const patch: TaskPatch = {};
  if (draft.title !== task.title) patch.title = draft.title;
  if (draft.description !== task.description) patch.description = draft.description;
  if (draft.status !== task.status) patch.status = draft.status;
  if (draft.priority !== task.priority) patch.priority = draft.priority;
  if (draft.assigneeId !== task.assigneeId) patch.assigneeId = draft.assigneeId;
  if (draft.dueDate !== task.dueDate) patch.dueDate = draft.dueDate;
  if (JSON.stringify(draft.labels) !== JSON.stringify(task.labels)) patch.labels = draft.labels;
  return patch;
}

interface SheetProps {
  task: Task | null;
  members: Member[];
  membersById: Map<string, Member>;
  liveActivity: BoardEvent[];
  onClose(): void;
  onSave(task: Task, patch: TaskPatch, baseVersion: number): Promise<Task>;
  onDelete(task: Task): Promise<void>;
}

export function TaskDetailSheet({ task, ...rest }: SheetProps) {
  // Keep showing the last task while the sheet animates closed.
  const [shown, setShown] = useState<Task | null>(task);
  if (task && task !== shown) setShown(task);
  const open = task !== null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && rest.onClose()}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        data-testid="task-detail"
        onCloseAutoFocus={(e) => {
          // Return keyboard focus to the card that was opened (if it still exists).
          const cardEl = shown && document.querySelector<HTMLElement>(`[data-task-id="${shown.id}"] [role=button]`);
          if (cardEl) {
            e.preventDefault();
            cardEl.focus();
          }
        }}
      >
        {shown && <TaskEditor key={shown.id} task={shown} open={open} {...rest} />}
      </SheetContent>
    </Sheet>
  );
}

function TaskEditor({
  task,
  open,
  members,
  membersById,
  liveActivity,
  onClose,
  onSave,
  onDelete,
}: Omit<SheetProps, "task"> & { task: Task; open: boolean }) {
  const now = useNow();
  // Live edits from teammates flow into fields you haven't touched (keepDirtyValues);
  // fields you are editing stay yours, and saving checks the version you started from.
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    values: taskToFormValues(task),
    resetOptions: { keepDirtyValues: true },
  });
  const isDirty = form.formState.isDirty;
  const [editBase, setEditBase] = useState<number | null>(null);
  if (isDirty && editBase === null) setEditBase(task.version);
  if (!isDirty && editBase !== null) setEditBase(null);
  const remoteChange = editBase !== null && editBase !== task.version;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const history = useActivity(open, task.id);
  const events = useMemo(
    () => mergeEvents(history.events, liveActivity.filter((e) => e.taskId === task.id)),
    [history.events, liveActivity, task.id],
  );

  const submit = form.handleSubmit(async (values) => {
    const patch = diffTask(task, formValuesToDraft(values));
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    try {
      await onSave(task, patch, editBase ?? task.version);
      form.reset(values);
      toast.success("Saved successfully.");
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        const current = (err.details as { task?: Task } | undefined)?.task;
        if (current) form.reset(taskToFormValues(current));
        toast.warning("Someone else changed this task while you were editing. Their version is shown — re-apply your changes.");
      } else if (err instanceof ApiError && err.code === "TASK_NOT_FOUND") {
        toast.warning("This task was deleted by someone else.");
        onClose();
      } else if (!applyServerErrors(form, fieldErrors(err))) {
        toast.error(friendlyError(err));
      }
    }
  });

  const creator = membersById.get(task.createdBy);
  const updater = membersById.get(task.updatedBy);
  const submitting = form.formState.isSubmitting;

  return (
    <>
      <SheetHeader className="border-b px-5 py-4">
        <span className="pr-8 font-mono text-xs text-muted-foreground">{task.key}</span>
        <SheetTitle className="text-base leading-snug wrap-break-word">{task.title}</SheetTitle>
        <SheetDescription className="text-xs">
          Created by {creator?.name ?? "a former teammate"} {relativeTime(task.createdAt, now)}
          {task.version > 1 && (
            <>
              {" "}
              · Updated by {updater?.name ?? "a former teammate"} {relativeTime(task.updatedAt, now)}
            </>
          )}
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
          {remoteChange && (
            <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning" role="status">
              Someone just updated this task. Fields you haven&apos;t touched were refreshed; saving will check for conflicts.
            </p>
          )}
          <TaskFormFields form={form} members={members} idPrefix="edit" />
          <Separator className="my-6" />
          <section aria-labelledby="task-history-heading">
            <h3 id="task-history-heading" className="mb-1 text-sm font-semibold">
              History
            </h3>
            <EventList
              events={events}
              membersById={membersById}
              loading={history.loading}
              error={history.error}
              showTask={false}
              emptyText="No history yet."
            />
          </section>
        </div>
        <SheetFooter className="flex-row items-center justify-between border-t px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={submitting}
          >
            <Trash2 />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </div>
        </SheetFooter>
      </form>

      <DeleteTaskDialog
        task={task}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={async () => {
          try {
            await onDelete(task);
            setConfirmDelete(false);
            toast.success(`${task.key} deleted.`);
            onClose();
          } catch (err) {
            setConfirmDelete(false);
            toast.error(
              err instanceof ApiError && err.code === "VERSION_CONFLICT"
                ? "Someone changed this task just now. Take a look before deleting it."
                : friendlyError(err),
            );
          }
        }}
      />
    </>
  );
}
