import { ok, fail, isAdmin, listAll, hasAdminKey } from '../../_shared.js';

export async function onRequestGet({ request, env }) {
  if (!hasAdminKey(request, env)) return fail('관리자 인증 필요', 401);
  const token = new URL(request.url).searchParams.get('token');
  if (!(await isAdmin(env, token))) return fail('관리자 인증 필요', 401);

  // 관리자 화면에서만 쓰는 전수 조회. 인원수만큼 KV get 이 나가지만
  // 사람이 눌러야 도는 페이지라 순위표처럼 캐시하지 않는다.
  const keys = await listAll(env, 'user:');
  const list = await Promise.all(
    keys.map(async ({ name }) => {
      const id = name.slice('user:'.length);
      const u = await env.SNOWBALL_KV.get(name, 'json');
      if (!u) return null;
      return {
        id,
        pw: u.pw,
        nick: u.nick || id,
        gender: u.gender || '',
        provider: u.provider || 'local',
        score: u.score || 0,
        round: u.round || 0,
        bestRound: u.bestRound || u.round || 0,
        plays: u.plays || 0,
        at: u.at,
        joined: u.joined,
      };
    })
  );

  return ok({ users: list.filter(Boolean).sort((a, b) => b.score - a.score) });
}
