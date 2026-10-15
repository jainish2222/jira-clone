import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_USERS } from "./users";
import type { Task, TaskStatus } from "../../src/types";

export type UserKey = keyof typeof E2E_USERS;

export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 7)}`;
}

/** Signs in through the real login form. */
export async function signIn(page: Page, user: UserKey = "alice") {
  await page.goto("/login");
  await page.getByLabel("Username").fill(E2E_USERS[user].username);
  await page.getByLabel("Password").fill(E2E_USERS[user].password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live");
}

/** Reloads and waits until the board is hydrated and connected (the live status needs client JS). */
export async function reloadBoard(page: Page) {
  await page.reload();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "live");
}

/** Creates a task through the API using the page's session cookie. */
export async function createTaskViaApi(page: Page, body: Partial<Task> & { title: string }): Promise<Task> {
  const res = await page.request.post("/api/tasks", { data: body });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data.task as Task;
}

export function column(page: Page, status: TaskStatus): Locator {
  return page.getByTestId(`column-${status}`);
}

export function card(page: Page, title: string): Locator {
  return page.getByTestId("task-card").filter({ hasText: title });
}

/** Drags a card onto a column with real pointer movement (dnd-kit needs intermediate moves). */
export async function dragCardTo(page: Page, title: string, status: TaskStatus) {
  const source = card(page, title).locator("[role=button]");
  await source.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  const to = (await column(page, status).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 16);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 90, { steps: 18 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}
