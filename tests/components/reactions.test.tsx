import { useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactionProvider, useReactions, type ReactionRequest } from "@/components/reactions/reaction-provider";
import { REACTIONS } from "@/config/reactions";

const DONE = REACTIONS.in_progress_to_done;

const request = (over: Partial<ReactionRequest> = {}): ReactionRequest => ({
  eventId: "evt-1",
  category: "in_progress_to_done",
  taskKey: "TASK-007",
  taskTitle: "Ship it",
  toStatus: "done",
  actorName: "Bob Ray",
  isSelf: false,
  ...over,
});

const api: { play: (r: ReactionRequest) => void } = { play: () => {} };
function Grab() {
  const { play } = useReactions();
  useEffect(() => {
    api.play = play;
  }, [play]);
  return null;
}
const play = (r: ReactionRequest) => api.play(r);
function setup() {
  return render(
    <ReactionProvider>
      <Grab />
    </ReactionProvider>,
  );
}

function setReducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes("reduce"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.useFakeTimers();
  setReducedMotion(false);
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("meme reactions", () => {
  it("shows the caption and who moved what, then dismisses itself", () => {
    setup();
    act(() => play(request()));
    expect(screen.getByTestId("reaction-caption")).toHaveTextContent(DONE.caption);
    expect(screen.getByText("Bob Ray moved TASK-007 to Done")).toBeInTheDocument();
    expect(screen.getByTestId("reaction-overlay")).toHaveAttribute("data-reaction", "in_progress_to_done");
    act(() => vi.advanceTimersByTime(DONE.durationMs + 100));
    expect(screen.queryByTestId("reaction-overlay")).not.toBeInTheDocument();
  });

  it("can be dismissed with the button or Escape", () => {
    setup();
    act(() => play(request()));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reaction" }));
    expect(screen.queryByTestId("reaction-overlay")).not.toBeInTheDocument();

    act(() => play(request({ eventId: "evt-2" })));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("reaction-overlay")).not.toBeInTheDocument();
  });

  it("never plays the same event twice (reconnects, duplicate messages)", () => {
    setup();
    act(() => play(request()));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reaction" }));
    act(() => play(request()));
    expect(screen.queryByTestId("reaction-overlay")).not.toBeInTheDocument();
  });

  it("shows only one reaction at a time — the newest wins", () => {
    setup();
    act(() => play(request()));
    act(() => play(request({ eventId: "evt-2", category: "other_transition", toStatus: "todo", isSelf: true })));
    expect(screen.getAllByTestId("reaction-overlay")).toHaveLength(1);
    expect(screen.getByTestId("reaction-caption")).toHaveTextContent(REACTIONS.other_transition.caption);
    expect(screen.getByText("You moved TASK-007 to To Do")).toBeInTheDocument();
  });

  it("falls back from video to the still poster, then to the caption, when media fails", () => {
    const { container } = setup();
    act(() => play(request()));
    const video = container.querySelector("video")!;
    expect(video).toBeInTheDocument();
    expect(video.muted).toBe(true);
    fireEvent.error(video);
    const poster = container.querySelector("img")!;
    expect(poster.getAttribute("src")).toBe(DONE.poster);
    fireEvent.error(poster);
    expect(container.querySelector("[data-stage=caption]")).toBeInTheDocument();
    expect(screen.getByTestId("reaction-caption")).toHaveTextContent(DONE.caption);
  });

  it("uses a still image instead of video when reduced motion is preferred", () => {
    setReducedMotion(true);
    const { container } = setup();
    act(() => play(request()));
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(DONE.poster);
  });

  it("offers 'tap for sound' when the browser blocks autoplay with sound", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    setup();
    await act(async () => play(request()));
    expect(playSpy).toHaveBeenCalled();
    expect(screen.getByText("Tap for sound")).toBeInTheDocument();
  });

  it("does not play sound when muted on this device", async () => {
    localStorage.setItem("tasklol:sound", "0");
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    setup();
    await act(async () => play(request()));
    // The (muted) video may call play(); the audio track must not.
    const audioCalls = playSpy.mock.contexts.filter((el) => el instanceof HTMLAudioElement);
    expect(audioCalls).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Play sound" })).toBeInTheDocument();
  });
});
