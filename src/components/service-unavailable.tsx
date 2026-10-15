"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DatabaseZap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/board/app-header";

export function ServiceUnavailable({ notConfigured = false }: { notConfigured?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <Logo className="mb-10 text-lg" />
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
        <DatabaseZap className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold">
          {notConfigured ? "TaskLOL isn't set up yet" : "We can't reach the database right now"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {notConfigured
            ? "The server is missing its configuration. Ask the board admin to check the environment variables."
            : "The database is temporarily unavailable. Your tasks are safe — please try again in a moment."}
        </p>
        {!notConfigured && (
          <Button className="mt-5" onClick={() => startTransition(() => router.refresh())} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Try again
          </Button>
        )}
      </div>
    </main>
  );
}
