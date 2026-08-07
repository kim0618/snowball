import {
  ok, fail, clean, readJson, isAdmin, hasAdminKey,
  getUser, getBoard, putBoard, MAX_ID,
} from '../../_shared.js';

export async function onRequestPost({ request, env }) {
  if (!hasAdminKey(request, env)) return fail('관리자 인증 필요', 401);
  const body = await readJson(request);
  if (!body || !(await isAdmin(env, body.token))) return fail('관리자 인증 필요', 401);

  const id = clean(body.id, MAX_ID);
  const u = await getUser(env, id);
  if (u) {
    // 닉네임 역인덱스와 순위표까지 같이 지워야 유령 기록이 안 남는다
    await env.SNOWBALL_KV.delete(`user:${id}`);
    if (u.nick) await env.SNOWBALL_KV.delete(`nick:${u.nick}`);
    const board = await getBoard(env);
    if (board.some((r) => r.id === id)) {
      await putBoard(env, board.filter((r) => r.id !== id));
    }
  }
  return ok({});
}
