import { z } from "zod";
import type { ReactionCategory } from "@/types";

/**
 * Meme reactions, one per status-change category.
 *
 * Two packs ship with TaskLOL; pick one with ACTIVE_PACK below:
 *   "india"   — famous Indian memes (default)
 *   "classic" — international classics
 *
 * To swap a single meme, drop files into public/memes/<pack>/ and change its paths.
 * Nothing else in the app needs to change. Supported:
 *   media: .mp4 .webm (video) or .gif .png .jpg .jpeg .webp (image)
 *   poster: a still image shown for reduced motion or if the video fails
 *   sound: .mp3 .ogg .wav .m4a (optional; viewers can mute it)
 * Leave media/sound out to show just the caption with a small animation.
 * Only local files under /memes/ are allowed — no external URLs.
 */
type MemePack = "india" | "classic";

export const ACTIVE_PACK: MemePack = "india";

const files = (pack: MemePack, name: string) => ({
  media: `/memes/${pack}/${name}.mp4`,
  poster: `/memes/${pack}/${name}.jpg`,
  sound: `/memes/${pack}/${name}.mp3`,
});

const PACKS: Record<MemePack, Record<ReactionCategory, ReactionConfigInput>> = {
  india: {
    todo_to_in_progress: {
      caption: "Abhi maza aayega na bhidu!",
      blurb: "Work has officially begun.",
      emoji: "😎",
      ...files("india", "todo-to-in-progress"),
      durationMs: 5000,
    },
    in_progress_to_done: {
      caption: "7 crore! Absolute legend.",
      blurb: "Kaun Banega Crorepati? You did.",
      emoji: "🏆",
      ...files("india", "in-progress-to-done"),
      durationMs: 4500,
    },
    done_to_in_progress: {
      caption: "Ye dukh kahe khatam nahi hota?",
      blurb: "A finished task has returned.",
      emoji: "😩",
      ...files("india", "done-to-in-progress"),
      durationMs: 5500,
    },
    in_progress_to_todo: {
      caption: "Moye moye.",
      blurb: "Back to the queue it goes.",
      emoji: "💔",
      ...files("india", "in-progress-to-todo"),
      durationMs: 5500,
    },
    other_transition: {
      caption: "Kuch toh gadbad hai!",
      blurb: "Plot twist.",
      emoji: "🕵️",
      ...files("india", "other-transition"),
      durationMs: 5000,
    },
    all_done: {
      caption: "Jalwa hai hamara! Board clear.",
      blurb: "Every single task is done.",
      emoji: "😎",
      ...files("india", "all-done"),
      durationMs: 6000,
    },
  },
  classic: {
    todo_to_in_progress: {
      caption: "Fine. I'll do it myself.",
      blurb: "Work has (reluctantly) begun.",
      emoji: "😾",
      ...files("classic", "todo-to-in-progress"),
      durationMs: 4500,
    },
    in_progress_to_done: {
      caption: "Absolute legend.",
      blurb: "Locked in. Shipped it.",
      emoji: "🏆",
      ...files("classic", "in-progress-to-done"),
      durationMs: 4000,
    },
    done_to_in_progress: {
      caption: "Wait, it's not done?",
      blurb: "A finished task has returned.",
      emoji: "🤔",
      ...files("classic", "done-to-in-progress"),
      durationMs: 4500,
    },
    in_progress_to_todo: {
      caption: "We need to talk.",
      blurb: "Back to the queue it goes.",
      emoji: "😱",
      ...files("classic", "in-progress-to-todo"),
      durationMs: 4500,
    },
    other_transition: {
      caption: "Plot twist.",
      blurb: "Everybody stay calm.",
      emoji: "🌀",
      ...files("classic", "other-transition"),
      durationMs: 5500,
    },
    all_done: {
      caption: "Board clear. Absolute legends.",
      blurb: "Every single task is done.",
      emoji: "🎉",
      ...files("classic", "in-progress-to-done"),
      durationMs: 5000,
    },
  },
};

/**
 * Shown inside the empty To Do column while every task is done (no sound; it stays
 * on screen). Same path rules as reactions.
 */
const BOARD_CLEAR_PACKS: Record<MemePack, { caption: string; note: string; media: string; poster: string }> = {
  india: {
    caption: "Apun hi bhagwan hai.",
    note: "Sab kaam khatam. Every task is done.",
    media: "/memes/india/board-clear.mp4",
    poster: "/memes/india/board-clear.jpg",
  },
  classic: {
    caption: "Inbox zero. Legendary.",
    note: "Every task is done.",
    media: "/memes/classic/in-progress-to-done.mp4",
    poster: "/memes/classic/in-progress-to-done.jpg",
  },
};

const RAW_REACTIONS = PACKS[ACTIVE_PACK];

// Optional sub-folders (no dots allowed in folder names, so "../" can't sneak in), then a file name.
const LOCAL = (exts: string) => new RegExp(`^/memes/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9._-]+\\.(${exts})$`, "i");
const MEDIA_RE = LOCAL("mp4|webm|gif|png|jpe?g|webp");
const IMAGE_RE = LOCAL("gif|png|jpe?g|webp");
const SOUND_RE = LOCAL("mp3|ogg|wav|m4a");

const reactionConfigSchema = z.object({
  caption: z.string().min(1).max(80),
  blurb: z.string().max(120).default(""),
  emoji: z.string().max(8).default("✨"),
  media: z.string().regex(MEDIA_RE).optional(),
  poster: z.string().regex(IMAGE_RE).optional(),
  sound: z.string().regex(SOUND_RE).optional(),
  durationMs: z.number().int().min(1500).max(10_000).default(4500),
});
type ReactionConfigInput = z.input<typeof reactionConfigSchema>;

export interface ReactionMedia {
  kind: "video" | "image";
  src: string;
  type?: string;
}

export interface ReactionConfig {
  caption: string;
  blurb: string;
  emoji: string;
  media: ReactionMedia | null;
  poster: string | null;
  sound: string | null;
  durationMs: number;
}

function toMedia(src: string | undefined): ReactionMedia | null {
  if (!src) return null;
  const ext = src.split(".").pop()!.toLowerCase();
  if (ext === "mp4") return { kind: "video", src, type: "video/mp4" };
  if (ext === "webm") return { kind: "video", src, type: "video/webm" };
  return { kind: "image", src };
}

/** Validates one entry; anything invalid falls back to a caption-only reaction. */
export function resolveReaction(input: ReactionConfigInput, fallbackCaption = "Plot twist."): ReactionConfig {
  const parsed = reactionConfigSchema.safeParse(input);
  if (!parsed.success) {
    if (typeof console !== "undefined") {
      console.warn("[TaskLOL] Invalid reaction config; using caption only.", parsed.error.issues);
    }
    const caption = typeof input?.caption === "string" && input.caption.trim() ? input.caption.slice(0, 80) : fallbackCaption;
    return { caption, blurb: "", emoji: "✨", media: null, poster: null, sound: null, durationMs: 4500 };
  }
  const c = parsed.data;
  return {
    caption: c.caption,
    blurb: c.blurb,
    emoji: c.emoji,
    media: toMedia(c.media),
    poster: c.poster ?? null,
    sound: c.sound ?? null,
    durationMs: c.durationMs,
  };
}

export const REACTIONS: Record<ReactionCategory, ReactionConfig> = Object.fromEntries(
  Object.entries(RAW_REACTIONS).map(([k, v]) => [k, resolveReaction(v)]),
) as Record<ReactionCategory, ReactionConfig>;

const boardClear = BOARD_CLEAR_PACKS[ACTIVE_PACK];
const boardClearMedia = z.string().regex(MEDIA_RE).safeParse(boardClear.media);
const boardClearPoster = z.string().regex(IMAGE_RE).safeParse(boardClear.poster);

/** The empty-board celebration (validated the same way; falls back to caption only). */
export const BOARD_CLEAR = {
  caption: boardClear.caption,
  note: boardClear.note,
  media: boardClearMedia.success ? toMedia(boardClearMedia.data) : null,
  poster: boardClearPoster.success ? boardClearPoster.data : null,
};
