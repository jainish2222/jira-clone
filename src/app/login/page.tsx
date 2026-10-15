import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/board/app-header";
import { LoginForm } from "@/components/auth/login-form";
import { getMemberFromCookieHeader } from "@/services/members";

export const metadata: Metadata = { title: "Sign in" };

function safeNext(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  // Only same-site paths: "/x" but never "//evil.com" or "/\evil.com".
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);

  // Already signed in? Skip the form. (If the database is down, just show the form.)
  const member = await getMemberFromCookieHeader((await headers()).get("cookie")).catch(() => null);
  if (member) redirect(next);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]"
      />
      <div className="relative w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="text-lg" />
          <p className="mt-3 text-sm text-muted-foreground">Serious tasks. Unserious reactions.</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-base font-semibold">Sign in to your team board</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Use the account your board admin set up for you.</p>
          <LoginForm next={next} expired={params.expired === "1"} />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Forgot your password? Ask your board admin to reset it.</p>
      </div>
    </main>
  );
}
