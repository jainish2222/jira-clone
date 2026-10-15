"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fieldErrors, friendlyError, newRequestId } from "@/lib/api-client";
import type { Member, TaskStatus } from "@/types";
import type { TaskDraft } from "@/components/board/use-board";
import type { Task } from "@/types";
import {
  applyServerErrors,
  emptyFormValues,
  formValuesToDraft,
  taskFormSchema,
  TaskFormFields,
  type TaskFormValues,
} from "./task-form";

export function CreateTaskDialog({
  open,
  initialStatus,
  members,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  initialStatus: TaskStatus;
  members: Member[];
  onOpenChange(open: boolean): void;
  onCreate(draft: TaskDraft, clientRequestId: string): Promise<Task>;
}) {
  // The parent remounts this dialog (via `key`) each time it opens, so the form
  // starts empty and gets one request id per session: double-clicking "Create"
  // or retrying after a network blip can never make two tasks.
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: emptyFormValues(initialStatus),
  });
  const [requestId] = useState(newRequestId);

  const submit = form.handleSubmit(async (values) => {
    try {
      await onCreate(formValuesToDraft(values), requestId);
      toast.success("Task created.");
      onOpenChange(false);
    } catch (err) {
      if (!applyServerErrors(form, fieldErrors(err))) toast.error(friendlyError(err));
    }
  });

  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Add it to the board. Everyone on the team will see it right away.</DialogDescription>
          </DialogHeader>
          <TaskFormFields form={form} members={members} idPrefix="create" autoFocusTitle />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
