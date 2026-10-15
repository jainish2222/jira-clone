"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, fieldErrors, friendlyError } from "@/lib/api-client";
import { newPasswordSchema, PASSWORD_MAX } from "@/lib/validations/auth";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(PASSWORD_MAX),
    newPassword: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: "Passwords don't match", path: ["confirm"] })
  .refine((v) => v.newPassword !== v.currentPassword, { message: "Choose a new password", path: ["newPassword"] });
type Values = z.infer<typeof schema>;

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });
  const { register, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await api("/api/auth/password", { method: "POST", body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
      toast.success("Password changed. Your other devices have been signed out.");
      onOpenChange(false);
    } catch (err) {
      const fields = fieldErrors(err);
      if (fields.currentPassword) form.setError("currentPassword", { message: fields.currentPassword });
      else if (fields.newPassword) form.setError("newPassword", { message: fields.newPassword });
      else toast.error(friendlyError(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !formState.isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>You&apos;ll stay signed in here; other devices will be signed out.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {(
              [
                ["currentPassword", "Current password", "current-password"],
                ["newPassword", "New password", "new-password"],
                ["confirm", "Confirm new password", "new-password"],
              ] as const
            ).map(([name, label, autoComplete]) => (
              <div key={name} className="grid gap-1.5">
                <Label htmlFor={`pw-${name}`}>{label}</Label>
                <Input
                  id={`pw-${name}`}
                  type="password"
                  autoComplete={autoComplete}
                  aria-invalid={!!e[name]}
                  {...register(name)}
                />
                {e[name] && (
                  <p className="text-xs text-destructive" role="alert">
                    {e[name]?.message}
                  </p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={formState.isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
