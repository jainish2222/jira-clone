"use client";

import { useState } from "react";
import type { ReactionConfig } from "@/config/reactions";
import { cn } from "@/lib/utils";

type Stage = "media" | "poster" | "caption";

/**
 * Plays the meme with graceful fallbacks:
 *   video/gif  ->  still poster  ->  big emoji with a small wobble.
 * Reduced motion skips straight to the still image. Videos are always muted;
 * sound is a separate audio track the overlay controls.
 */
export function ReactionMediaView({
  config,
  reducedMotion,
  className,
}: {
  config: ReactionConfig;
  reducedMotion: boolean;
  className?: string;
}) {
  const initial: Stage = config.media && !reducedMotion ? "media" : config.poster ? "poster" : "caption";
  const [stage, setStage] = useState<Stage>(initial);
  const fallBack = () => setStage((s) => (s === "media" && config.poster ? "poster" : "caption"));

  return (
    // object-contain: many memes have their subtitle burned in, so never crop the frame.
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-neutral-950", className)} data-stage={stage}>
      {stage === "media" && config.media?.kind === "video" && (
        <video
          className="size-full object-contain"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={config.poster ?? undefined}
          onError={fallBack}
          aria-hidden
          // Autoplay of muted video is allowed everywhere; if it still fails we keep the poster frame.
          onCanPlay={(e) => void e.currentTarget.play().catch(() => undefined)}
        >
          <source src={config.media.src} type={config.media.type} onError={fallBack} />
        </video>
      )}
      {stage === "media" && config.media?.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- local meme GIFs must not be re-encoded
        <img src={config.media.src} alt="" className="size-full object-contain" onError={fallBack} />
      )}
      {stage === "poster" && config.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.poster} alt="" className="size-full object-contain" onError={() => setStage("caption")} />
      )}
      {stage === "caption" && (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 via-neutral-900 to-neutral-950">
          <span
            className="text-5xl select-none"
            style={reducedMotion ? undefined : { animation: "reaction-wobble 900ms ease-in-out 2" }}
            aria-hidden
          >
            {config.emoji}
          </span>
        </div>
      )}
    </div>
  );
}
