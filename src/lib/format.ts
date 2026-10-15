import { PRIORITY_LABELS, STATUS_LABELS, type BoardEvent, type Member, type TaskPriority, type TaskStatus } from "@/types";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** A stable hue per member so avatars are recognisable at a glance. */
export function memberHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

function memberName(members: Map<string, Member>, id: string | null | undefined): string {
  if (!id) return "nobody";
  return members.get(id)?.name ?? "a former teammate";
}

/** One line describing an activity event, e.g. "moved TASK-004 to Done". Actor is shown separately. */
export function describeEvent(event: BoardEvent, members: Map<string, Member>): string {
  const key = event.taskKey ?? "a task";
  switch (event.type) {
    case "created":
      return `created ${key}`;
    case "deleted":
      return `deleted ${key}`;
    case "status_changed": {
      const to = event.changes.status?.to as TaskStatus | undefined;
      return `moved ${key} to ${to ? STATUS_LABELS[to] : "another column"}`;
    }
    case "assigned": {
      const to = event.changes.assigneeId?.to as string | null | undefined;
      return to ? `assigned ${key} to ${memberName(members, to)}` : `unassigned ${key}`;
    }
    case "edited": {
      const fields = Object.keys(event.changes);
      const names: Record<string, string> = {
        title: "title",
        description: "description",
        priority: "priority",
        dueDate: "due date",
        labels: "labels",
      };
      if (fields.length === 1 && fields[0] === "priority") {
        const to = event.changes.priority.to as TaskPriority;
        return `set ${key} priority to ${PRIORITY_LABELS[to]}`;
      }
      return `edited ${key} ${fields.map((f) => names[f] ?? f).join(", ")}`;
    }
    case "moved":
      return `reordered ${key}`;
    case "settings_changed":
      return "changed board settings";
  }
}
