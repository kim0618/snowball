import {
  ok, fail, clean, readJson, statsOf,
  getUser, putUser, getBoard, putBoard, withEntry, hasValidUserSession, MAX_ID, MAX_SCORE,
} from '../_shared.js';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail('잘못된 형식');

  const id = clean(body.id, MAX_ID);
  const u = await getUser(env, id);
  if (!hasValidUserSession(u, body.token)) {
    return fail('다시 로그인해주세요', 401);
  }

  const score = Math.floor(Number(body.score));
  const round = Math.floor(Number(body.round)) || 0;
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return fail('점수 범위 오류');
  }

  const isBest = score > (u.score || 0);
  u.plays = (u.plays || 0) + 1;
  u.bestRound = Math.max(u.bestRound || 0, round);
  if (isBest) {
    u.score = score;
    u.round = round;
    u.at = new Date().toISOString();
  }
  await putUser(env, id, u);

  let list = await getBoard(env);
  if (isBest) {
    list = withEntry(list, { id, nick: u.nick || id, score: u.score, round: u.round || 0 });
    await putBoard(env, list);
  }

  const rank = list.findIndex((r) => r.id === id) + 1;
  return ok({
    best: u.score, updated: isBest, rank: rank || null,
    stats: statsOf(u), scores: list,
  });
}
