import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BoardApp } from "@/components/board/board-app";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { isAppError } from "@/lib/errors/app-error";
import { toDatabaseUnavailable } from "@/lib/mongodb";
import { getBoardSnapshot } from "@/services/board";
import { getMemberFromCookieHeader } from "@/services/members";
import type { BoardSnapshot, Member } from "@/types";

type LoadResult =
  | { kind: "ok"; member: Member; snapshot: BoardSnapshot }
  | { kind: "signed-out" }
  | { kind: "unavailable"; notConfigured: boolean };

async function load(): Promise<LoadResult> {
  try {
    const member = await getMemberFromCookieHeader((await headers()).get("cookie"));
    if (!member) return { kind: "signed-out" };
    return { kind: "ok", member, snapshot: await getBoardSnapshot() };
  } catch (err) {
    const unavailable = isAppError(err) ? err : toDatabaseUnavailable(err);
    if (unavailable && unavailable.status === 503) {
      return { kind: "unavailable", notConfigured: unavailable.code === "SERVICE_NOT_CONFIGURED" };
    }
    throw err;
  }
}

export default async function BoardPage() {
  const result = await load();
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "unavailable") return <ServiceUnavailable notConfigured={result.notConfigured} />;
  return <BoardApp initial={result.snapshot} me={result.member} />;
}
