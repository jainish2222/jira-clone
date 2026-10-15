import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-lg font-semibold">This page wandered off the board.</h1>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Back to the board
        </Link>
      </div>
    </main>
  );
}
