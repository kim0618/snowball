import {
  ok, fail, clean, makeToken, readJson, statsOf,
  getUser, putUser, getBoard, adminCreds, newAdminSession, MAX_ID,
} from '../_shared.js';

// 입력창 하나로 일반·관리자를 함께 처리한다.
// 관리자면 admin:true 를 내주고 클라이언트가 관리자 페이지로 보낸다.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail('잘못된 형식');

  const id = clean(body.id, MAX_ID);
  const pw = String(body.pw || '');
  const admin = adminCreds(env);

  if (admin && id === admin.id) {
    if (pw !== admin.pw) return fail('아이디 또는 비밀번호가 달라요', 401);
    return ok({ admin: true, token: await newAdminSession(env) });
  }

  const u = await getUser(env, id);
  if (!u || u.pw !== pw) return fail('아이디 또는 비밀번호가 달라요', 401);

  u.token = makeToken();
  await putUser(env, id, u);

  return ok({
    id, nick: u.nick || id, token: u.token, best: u.score || 0,
    stats: statsOf(u), scores: await getBoard(env),
  });
}
