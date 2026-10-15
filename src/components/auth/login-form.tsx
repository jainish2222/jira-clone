"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, friendlyError } from "@/lib/api-client";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

export function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });
  const [error, setError] = useState<string | null>(expired ? "Your session ended. Please sign in again." : null);
  const { register, formState } = form;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: values });
      // A full page load renders the board fresh with the new session cookie
      // (no client router cache from the signed-out state).
      window.location.assign(next);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "INVALID_CREDENTIALS" || err.code === "ACCOUNT_LOCKED" || err.code === "RATE_LIMITED")) {
        setError(err.message);
      } else {
        setError(friendlyError(err));
      }
      form.setValue("password", "");
      form.setFocus("password");
    }
  });

  return (
    // method="post": even if JavaScript hasn't loaded yet, credentials never end up in the URL.
    <form onSubmit={submit} method="post" noValidate className="grid gap-4">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus aria-invalid={!!formState.errors.username} {...register("username")} />
        {formState.errors.username && <p className="text-xs text-destructive">{formState.errors.username.message}</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register("password")} />
        {formState.errors.password && <p className="text-xs text-destructive">{formState.errors.password.message}</p>}
      </div>
      <Button type="submit" className="mt-1 h-9 w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}
