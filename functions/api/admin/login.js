import { ok, fail, readJson, adminCreds, newAdminSession, hasAdminKey } from '../../_shared.js';

export async function onRequestPost({ request, env }) {
  if (!hasAdminKey(request, env)) return fail('관리자 인증 필요', 401);

  const body = await readJson(request);
  if (!body) return fail('잘못된 형식');

  const admin = adminCreds(env);
  if (!admin) return fail('관리자 계정이 설정돼 있지 않아요 (ADMIN_ID/ADMIN_PW)', 503);
  if (String(body.id) !== admin.id || String(body.pw) !== admin.pw) {
    return fail('아이디 또는 비밀번호가 달라요', 401);
  }
  return ok({ token: await newAdminSession(env) });
}
