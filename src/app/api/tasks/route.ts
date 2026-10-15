import { authedRoute, ok, parseWith, readJson, searchParamsObject } from "@/lib/api/respond";
import { createTaskSchema, listTasksQuerySchema } from "@/lib/validations/task";
import { createTask, listTasks } from "@/services/tasks";

export const runtime = "nodejs";

export const GET = authedRoute(async ({ req }) => {
  const query = parseWith(listTasksQuerySchema, searchParamsObject(req));
  return ok({ tasks: await listTasks(query) });
});

export const POST = authedRoute(async ({ req, member }) => {
  const input = parseWith(createTaskSchema, await readJson(req));
  const result = await createTask(input, member.id);
  return ok({ task: result.task, event: result.event }, { status: result.created ? 201 : 200 });
});
