/**
 * Adds a handful of demo tasks for local development: `npm run seed`.
 * Refuses to run when the board already has tasks.
 */
import { resetMongoForTests, getCollections } from "@/lib/mongodb";
import { listMembers } from "@/services/members";
import { createTask } from "@/services/tasks";

const DEMO = [
  { title: "Set up high-fidelity prototypes with conditional logic", labels: ["Wireframes"], priority: "high", status: "todo" },
  { title: "Data entry cleanup", labels: ["Data"], priority: "low", status: "todo", description: "Remove duplicate rows from the Q3 import." },
  { title: "Write onboarding checklist", labels: ["Docs"], priority: "medium", status: "todo", due: 3 },
  { title: "Graphic design edits", labels: ["Design"], priority: "medium", status: "in_progress", due: -1 },
  { title: "Presentation slide design", labels: ["UI Design"], priority: "high", status: "in_progress" },
  { title: "Publish release notes", labels: ["Launch"], priority: "low", status: "done" },
] as const;

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const members = (await listMembers()).filter((m) => m.active);
  if (members.length === 0) throw new Error('Add a member first: npm run members -- add alice "Alice Example"');
  const { tasks } = await getCollections();
  if ((await tasks.countDocuments()) > 0) {
    console.log("The board already has tasks; nothing to do.");
    return;
  }
  for (const [i, t] of [...DEMO].reverse().entries()) {
    const actor = members[i % members.length];
    await createTask(
      {
        title: t.title,
        description: "description" in t ? t.description : "",
        status: t.status,
        priority: t.priority,
        labels: [...t.labels],
        dueDate: "due" in t ? inDays(t.due) : null,
        assigneeId: members[(i + 1) % members.length].id,
      },
      actor.id,
    );
  }
  console.log(`✔ Added ${DEMO.length} demo tasks.`);
}

main()
  .catch((err) => {
    console.error("✖", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => resetMongoForTests());
