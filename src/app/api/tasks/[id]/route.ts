import { authedRoute, noContent, ok, parseWith, readJson, searchParamsObject } from "@/lib/api/respond";
import { deleteTaskQuerySchema, updateTaskSchema } from "@/lib/validations/task";
import { deleteTask, getTask, updateTask } from "@/services/tasks";

export const runtime = "nodejs";

type Params = { id: string };

export const GET = authedRoute<Params>(async ({ params }) => {
  return ok({ task: await getTask(params.id) });
});

export const PATCH = authedRoute<Params>(async ({ req, params, member }) => {
  const input = parseWith(updateTaskSchema, await readJson(req));
  const result = await updateTask(params.id, input, member.id);
  return ok(result);
});

export const DELETE = authedRoute<Params>(async ({ req, params, member }) => {
  const { version } = parseWith(deleteTaskQuerySchema, searchParamsObject(req));
  await deleteTask(params.id, member.id, version);
  return noContent();
});
