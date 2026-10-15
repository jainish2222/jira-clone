import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskCardContent } from "@/components/board/task-card";
import type { Member, Task } from "@/types";

const bob: Member = { id: "b".repeat(24), username: "bob", name: "Bob Ray", active: true };
const base: Task = {
  id: "a".repeat(24),
  key: "TASK-012",
  title: "Prepare demo",
  description: "Slides and a short script",
  status: "todo",
  priority: "high",
  position: 1,
  dueDate: "2026-03-09",
  labels: ["Launch", "Sales"],
  assigneeId: bob.id,
  createdBy: bob.id,
  updatedBy: bob.id,
  version: 1,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  completedAt: null,
};

describe("task card", () => {
  it("shows key, title, description, labels, priority, assignee and an overdue due date", () => {
    const { container } = render(<TaskCardContent task={base} assignee={bob} today="2026-03-10" />);
    expect(screen.getByText("TASK-012")).toBeInTheDocument();
    expect(screen.getByText("Prepare demo")).toBeInTheDocument();
    expect(screen.getByText("Slides and a short script")).toBeInTheDocument();
    expect(screen.getByText("Launch")).toBeInTheDocument();
    expect(screen.getByText("High priority")).toBeInTheDocument();
    expect(screen.getByText("Assigned to Bob Ray")).toBeInTheDocument();
    expect(screen.getByText("(overdue)")).toBeInTheDocument();
    expect(container.querySelector("[data-overdue]")).toHaveTextContent("Mar 9");
  });

  it("is not overdue once done, and hides empty sections", () => {
    const task = { ...base, status: "done" as const, description: "", labels: [], assigneeId: null, dueDate: "2026-03-09" };
    const { container } = render(<TaskCardContent task={task} assignee={undefined} today="2026-03-10" />);
    expect(screen.queryByText("(overdue)")).not.toBeInTheDocument();
    expect(container.querySelector("[data-overdue]")).toBeNull();
    expect(screen.queryByText(/Assigned to/)).not.toBeInTheDocument();
  });
});
