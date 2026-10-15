"use client";

import { useState } from "react";
import { BOARD_CLEAR } from "@/config/reactions";
import { usePrefersReducedMotion } from "@/hooks/use-media-preferences";

/** Fills the empty To Do column while every task is done. Muted, looping, no sound. */
export function BoardClearCard() {
  const reducedMotion = usePrefersReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const showVideo = BOARD_CLEAR.media?.kind === "video" && !reducedMotion && !videoFailed;
  const showPoster = !showVideo && BOARD_CLEAR.poster && !posterFailed;

  return (
    <div className="overflow-hidden rounded-xl border border-success/30 bg-success/[0.06]" data-testid="board-clear">
      <div className="flex aspect-video items-center justify-center bg-neutral-950">
        {showVideo && BOARD_CLEAR.media && (
          <video
            className="size-full object-contain"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={BOARD_CLEAR.poster ?? undefined}
            onError={() => setVideoFailed(true)}
            aria-hidden
          >
            <source src={BOARD_CLEAR.media.src} type={BOARD_CLEAR.media.type} onError={() => setVideoFailed(true)} />
          </video>
        )}
        {showPoster && (
          // eslint-disable-next-line @next/next/no-img-element -- local meme still
          <img src={BOARD_CLEAR.poster!} alt="" className="size-full object-contain" onError={() => setPosterFailed(true)} />
        )}
        {!showVideo && !showPoster && (
          <span className="text-5xl" aria-hidden>
            🎉
          </span>
        )}
      </div>
      <div className="px-3.5 py-3 text-center">
        <p className="text-sm font-semibold">{BOARD_CLEAR.caption}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{BOARD_CLEAR.note}</p>
      </div>
    </div>
  );
}
