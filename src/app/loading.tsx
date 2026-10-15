import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy aria-label="Loading board">
      <div className="h-14 border-b bg-surface" />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 mb-6 h-4 w-56" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[3, 2, 1].map((n, i) => (
            <div key={i} className="rounded-2xl border bg-column/80 p-3">
              <Skeleton className="mb-4 ml-1 h-4 w-24" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: n }).map((_, j) => (
                  <Skeleton key={j} className="h-24 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
