import { expect, test } from "@playwright/test";
import { card, column, createTaskViaApi, dragCardTo, reloadBoard, signIn, uniqueTitle } from "./helpers";
import { REACTIONS } from "../../src/config/reactions";
import type { ReactionCategory } from "../../src/types";

/** Any of the memes configured for a move (one is picked at random). */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyCaption = (category: ReactionCategory) =>
  new RegExp(`^(${REACTIONS[category].map((v) => escapeRegExp(v.caption)).join("|")})$`);

test.describe("signing in", () => {
  test("redirects to sign-in, rejects a wrong password, then lets you in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Username").fill("alice");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect username or password.");
    await expect(page).not.toHaveURL(/password/); // credentials never land in the URL
    await signIn(page);
  });
});

test.describe("tasks", () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test("creates a task that persists after a refresh", async ({ page }) => {
    const title = uniqueTitle("Write launch post");
    await page.getByTestId("new-task").click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Description").fill("Draft, then review with Bob");
    await dialog.getByLabel("Labels").fill("marketing, blog");
    await dialog.getByRole("button", { name: "Create task" }).click();

    await expect(page.getByText("Task created.")).toBeVisible();
    await expect(column(page, "todo").getByText(title)).toBeVisible();
    await expect(card(page, title)).toContainText("marketing");

    await reloadBoard(page);
    await expect(column(page, "todo").getByText(title)).toBeVisible();
  });

  test("shows field errors for an empty title", async ({ page }) => {
    await page.getByTestId("new-task").click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    await dialog.getByLabel("Title").fill("   ");
    await dialog.getByRole("button", { name: "Create task" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Title can't be empty");
  });

  test("edits a task and records it in the history", async ({ page }) => {
    const title = uniqueTitle("Fix typo");
    await createTaskViaApi(page, { title });
    await card(page, title).click();
    const panel = page.getByTestId("task-detail");
    const newTitle = `${title} (homepage)`;
    await panel.getByLabel("Title").fill(newTitle);
    await panel.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved successfully.")).toBeVisible();
    await expect(card(page, newTitle)).toBeVisible();

    await reloadBoard(page);
    await card(page, newTitle).click();
    await expect(page.getByTestId("task-detail").getByText(/edited\s+title/)).toBeVisible();
  });

  test("deletes a task only after confirming", async ({ page }) => {
    const title = uniqueTitle("Old idea");
    await createTaskViaApi(page, { title });
    await card(page, title).click();
    await page.getByTestId("task-detail").getByRole("button", { name: "Delete" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("can't be undone");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(card(page, title)).toBeVisible();

    await page.getByTestId("task-detail").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete task" }).click();
    await expect(card(page, title)).toHaveCount(0);
    await reloadBoard(page);
    await expect(card(page, title)).toHaveCount(0);
  });

  test("searches and filters", async ({ page }) => {
    const tag = Math.random().toString(36).slice(2, 7);
    await createTaskViaApi(page, { title: `Alpha ${tag}`, priority: "high" });
    await createTaskViaApi(page, { title: `Beta ${tag}`, priority: "low" });
    await reloadBoard(page);

    const search = page.getByLabel("Search tasks");
    await search.fill(tag);
    await expect(card(page, `Alpha ${tag}`)).toBeVisible();
    await expect(card(page, `Beta ${tag}`)).toBeVisible();
    await expect(page.getByTestId("task-card")).toHaveCount(2);

    await page.getByLabel("Filter by priority").click();
    await page.getByRole("option", { name: "High" }).click();
    await expect(page.getByTestId("task-card")).toHaveCount(1);
    await expect(card(page, `Alpha ${tag}`)).toBeVisible();

    await search.fill(`nothing-matches-${tag}`);
    await expect(page.getByText("No tasks match your search.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByLabel("Search tasks")).toHaveValue("");
  });
});

test.describe("drag and drop with meme reactions", () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test("moving a card saves it and plays the matching meme", async ({ page }) => {
    const title = uniqueTitle("Ship feature");
    await createTaskViaApi(page, { title: uniqueTitle("Still open") }); // so finishing ours doesn't clear the board
    await createTaskViaApi(page, { title });

    await dragCardTo(page, title, "in_progress");
    const overlay = page.getByTestId("reaction-overlay");
    await expect(overlay).toHaveAttribute("data-reaction", "todo_to_in_progress");
    await expect(page.getByTestId("reaction-caption")).toHaveText(anyCaption("todo_to_in_progress"));
    await expect(column(page, "in_progress").getByText(title)).toBeVisible();
    await page.getByRole("button", { name: "Dismiss reaction" }).click();

    await dragCardTo(page, title, "done");
    await expect(overlay).toHaveAttribute("data-reaction", "in_progress_to_done");
    await expect(page.getByTestId("reaction-caption")).toHaveText(anyCaption("in_progress_to_done"));

    await reloadBoard(page);
    await expect(column(page, "done").getByText(title)).toBeVisible();
  });

  test("reordering inside a column does not play a reaction", async ({ page }) => {
    const first = uniqueTitle("First");
    const second = uniqueTitle("Second");
    await createTaskViaApi(page, { title: first, status: "done" });
    await createTaskViaApi(page, { title: second, status: "done" }); // goes on top
    await reloadBoard(page);
    await dragCardTo(page, first, "done");
    await page.waitForTimeout(800);
    await expect(page.getByTestId("reaction-overlay")).toHaveCount(0);
  });

  test("restores the card and explains when saving fails", async ({ page }) => {
    const title = uniqueTitle("Flaky network");
    await createTaskViaApi(page, { title });
    await page.route("**/api/tasks/*", (route) => (route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue()));

    await dragCardTo(page, title, "done");
    await expect(page.getByText("Couldn't save that change. Your task has been restored.")).toBeVisible();
    await expect(column(page, "todo").getByText(title)).toBeVisible();
    await expect(page.getByTestId("reaction-overlay")).toHaveCount(0);

    await page.unroute("**/api/tasks/*");
    await reloadBoard(page);
    await expect(column(page, "todo").getByText(title)).toBeVisible();
  });

  test("works with the keyboard", async ({ page }) => {
    const title = uniqueTitle("Keyboard only");
    await createTaskViaApi(page, { title: uniqueTitle("Neighbour below") });
    await createTaskViaApi(page, { title });
    await createTaskViaApi(page, { title: uniqueTitle("Neighbour above") });
    await reloadBoard(page);

    const handle = card(page, title).locator("[role=button]");
    await handle.focus();
    await page.keyboard.press("Enter"); // Enter opens the task
    await expect(page.getByTestId("task-detail")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("task-detail")).toBeHidden();

    await expect(handle).toBeFocused(); // focus returns to the card when the panel closes
    await page.keyboard.press("Space"); // pick up
    const announcer = page.locator("[id^=DndLiveRegion]");
    await expect(announcer).toContainText(/Picked up|is over To Do/);
    await page.keyboard.press("ArrowRight"); // move to the next column
    await expect(announcer).toContainText("is over In Progress");
    await page.keyboard.press("Space"); // drop
    await expect(page.getByTestId("reaction-overlay")).toHaveAttribute("data-reaction", "todo_to_in_progress");
    await expect(column(page, "in_progress").getByText(title)).toBeVisible();
  });
});

test.describe("team collaboration", () => {
  test("another member's changes appear live, with their meme", async ({ browser }) => {
    const alice = await (await browser.newContext()).newPage();
    const bob = await (await browser.newContext()).newPage();
    await signIn(alice, "alice");
    await signIn(bob, "bob");

    const title = uniqueTitle("Shared work");
    const task = await createTaskViaApi(bob, { title });
    await expect(card(alice, title)).toBeVisible(); // arrived over SSE, no refresh

    const res = await bob.request.patch(`/api/tasks/${task.id}`, { data: { version: task.version, status: "in_progress" } });
    expect(res.status()).toBe(200);
    await expect(column(alice, "in_progress").getByText(title)).toBeVisible();
    await expect(alice.getByTestId("reaction-overlay")).toHaveAttribute("data-reaction", "todo_to_in_progress");
    await expect(alice.getByTestId("reaction-overlay")).toContainText(`Bob Ray moved ${task.key} to In Progress`);
    await expect(alice.getByTestId("activity-dot")).toBeVisible();

    // A stale write from Alice's old copy is refused, not silently applied.
    const stale = await alice.request.patch(`/api/tasks/${task.id}`, { data: { version: task.version, title: "overwrite" } });
    expect(stale.status()).toBe(409);
  });
});
