import { firstName, initials, memberHue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Member } from "@/types";

export function MemberAvatar({ member, size = 20, className }: { member: Member; size?: number; className?: string }) {
  const hue = memberHue(member.id);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        background: `oklch(0.62 0.13 ${hue} / 0.22)`,
        color: `oklch(0.72 0.14 ${hue})`,
        boxShadow: `inset 0 0 0 1px oklch(0.65 0.13 ${hue} / 0.35)`,
      }}
    >
      {initials(member.name)}
    </span>
  );
}

/** Small "avatar + first name" badge used on cards. */
export function AssigneeBadge({ member }: { member: Member }) {
  return (
    <span className="inline-flex max-w-[140px] items-center gap-1.5 text-xs text-muted-foreground" title={`Assigned to ${member.name}`}>
      <MemberAvatar member={member} size={20} />
      <span className="truncate">{firstName(member.name)}</span>
      <span className="sr-only">Assigned to {member.name}</span>
    </span>
  );
}
