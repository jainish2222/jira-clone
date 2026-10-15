import { z } from "zod";
import type { ReactionCategory } from "@/types";

/**
 * Meme reactions for each status change. Every category has one or more memes;
 * the app picks one at random and never repeats the previous pick back-to-back.
 *
 * Two packs ship with TaskLOL; choose one with ACTIVE_PACK below:
 *   "india"   — famous Indian memes (default)
 *   "classic" — international classics
 *
 * To add or swap a meme, drop files into public/memes/<pack>/ and add an entry.
 * Nothing else in the app needs to change. Supported:
 *   media: .mp4 .webm (video) or .gif .png .jpg .jpeg .webp (image)
 *   poster: a still image shown for reduced motion or if the video fails
 *   sound: .mp3 .ogg .wav .m4a (optional; viewers can mute it)
 * Keep files small (a few dozen KB) and MP4s "faststart" so they play instantly;
 * all files are preloaded in the background once the board opens.
 * Only local files under /memes/ are allowed — no external URLs.
 */
type MemePack = "india" | "classic";

export const ACTIVE_PACK: MemePack = "india";

/** media + poster + sound that share one base name. */
const meme = (pack: MemePack, name: string, entry: Omit<ReactionConfigInput, "media" | "poster" | "sound">): ReactionConfigInput => ({
  media: `/memes/${pack}/${name}.mp4`,
  poster: `/memes/${pack}/${name}.jpg`,
  sound: `/memes/${pack}/${name}.mp3`,
  ...entry,
});

const PACKS: Record<MemePack, Record<ReactionCategory, ReactionConfigInput[]>> = {
  india: {
    todo_to_in_progress: [
      meme("india", "abhi-maza", { caption: "Abhi maza aayega na bhidu!", emoji: "😎", durationMs: 4500 }),
      meme("india", "arey-baap-re", { caption: "Arey baap re, yaad aaya!", emoji: "😳", durationMs: 4500 }),
    ],
    in_progress_to_done: [
      meme("india", "saat-crore", { caption: "7 crore! Absolute legend.", emoji: "🏆", durationMs: 4500 }),
      meme("india", "shabash-beta", { caption: "Shabash beta, bahut badhiya!", emoji: "👏", durationMs: 4500 }),
    ],
    done_to_in_progress: [
      meme("india", "ye-dukh", { caption: "Ye dukh kahe khatam nahi hota?", emoji: "😩", durationMs: 5000 }),
      meme("india", "hey-bhagwan", { caption: "Hey Bhagwan! Phir se?", emoji: "🙏", durationMs: 4500 }),
    ],
    in_progress_to_todo: [
      meme("india", "moye-moye", { caption: "Moye moye.", emoji: "💔", durationMs: 5000 }),
      meme("india", "khel-khatam", { caption: "Khel khatam. Back to To Do.", emoji: "🫡", durationMs: 4500 }),
    ],
    other_transition: [
      meme("india", "kuch-toh-gadbad", { caption: "Kuch toh gadbad hai!", emoji: "🕵️", durationMs: 4500 }),
      meme("india", "achha-ji", { caption: "Achha ji? Aisa hai kya?", emoji: "🤨", durationMs: 4500 }),
      meme("india", "baat-toh-sahi", { caption: "Baat toh sahi hai.", emoji: "😎", durationMs: 4000 }),
    ],
    all_done: [
      meme("india", "jalwa", { caption: "Jalwa hai hamara! Board clear.", emoji: "😎", durationMs: 5000 }),
      meme("india", "alag-level", { caption: "Board clear. Alag hi level ka banda!", emoji: "🔥", durationMs: 5000 }),
    ],
  },
  classic: {
    todo_to_in_progress: [meme("classic", "todo-to-in-progress", { caption: "Fine. I'll do it myself.", emoji: "😾" })],
    in_progress_to_done: [meme("classic", "in-progress-to-done", { caption: "Absolute legend.", emoji: "🏆", durationMs: 4000 })],
    done_to_in_progress: [meme("classic", "done-to-in-progress", { caption: "Wait, it's not done?", emoji: "🤔" })],
    in_progress_to_todo: [meme("classic", "in-progress-to-todo", { caption: "We need to talk.", emoji: "😱" })],
    other_transition: [meme("classic", "other-transition", { caption: "Plot twist.", emoji: "🌀", durationMs: 5500 })],
    all_done: [meme("classic", "in-progress-to-done", { caption: "Board clear. Absolute legends.", emoji: "🎉", durationMs: 5000 })],
  },
};

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

/** All memes per category for the active pack (each category has at least one). */
export const REACTIONS: Record<ReactionCategory, ReactionConfig[]> = Object.fromEntries(
  Object.entries(PACKS[ACTIVE_PACK]).map(([k, variants]) => [
    k,
    variants.length ? variants.map((v) => resolveReaction(v)) : [resolveReaction({ caption: "Plot twist." })],
  ]),
) as Record<ReactionCategory, ReactionConfig[]>;

/**
 * Picks a meme for a category at random, avoiding the one shown last time
 * (so the same meme never plays twice in a row when there's a choice).
 */
export function pickVariant(count: number, previous: number | undefined, random: number = Math.random()): number {
  if (count <= 1) return 0;
  const choices = Array.from({ length: count }, (_, i) => i).filter((i) => i !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(random * choices.length))];
}

/** Every file the active pack uses, for background preloading. */
export function reactionAssetUrls(): string[] {
  const urls = new Set<string>();
  for (const variants of Object.values(REACTIONS)) {
    for (const v of variants) {
      if (v.media) urls.add(v.media.src);
      if (v.sound) urls.add(v.sound);
      if (v.poster) urls.add(v.poster);
    }
  }
  return [...urls];
}
