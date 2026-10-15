import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardClearCard } from "@/components/reactions/board-clear-card";
import { BOARD_CLEAR, REACTIONS } from "@/config/reactions";

describe("board cleared", () => {
  it("celebrates in the empty column with a muted, looping meme", () => {
    const { container } = render(<BoardClearCard />);
    expect(screen.getByTestId("board-clear")).toHaveTextContent(BOARD_CLEAR.caption);
    const video = container.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
  });

  it("has its own reaction for finishing the last task", () => {
    expect(REACTIONS.all_done.caption.length).toBeGreaterThan(0);
    expect(REACTIONS.all_done.sound).toMatch(/\.mp3$/);
  });
});
