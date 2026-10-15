"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
        <p className="text-3xl" aria-hidden>
          🫠
        </p>
        <h1 className="mt-3 text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">That wasn&apos;t supposed to happen. Your tasks are safe.</p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
