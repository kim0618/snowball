import {
  ok, fail, clean, makeToken, readJson, getUser, putUser, getBoard,
  MAX_ID, MAX_NICK, MAX_PW, PW_RE, GENDERS,
} from '../_shared.js';

// provider:'naver' 는 네이버 로그인 화면(아직 골격만) 경로다.
// 비밀번호를 사용자가 입력하지 않으므로 서버가 대신 채운다.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail('잘못된 형식');

  const provider = body.provider === 'naver' ? 'naver' : 'local';
  const id = clean(body.id, MAX_ID);
  const nick = clean(body.nick, MAX_NICK) || id;
  const gender = GENDERS.includes(body.gender) ? body.gender : '';

  if (!id) return fail('아이디를 입력해주세요');
  if (!nick) return fail('닉네임을 입력해주세요');
  if (!gender) return fail('성별을 선택해주세요');
  if (await getUser(env, id)) return fail('이미 있는 아이디예요', 409);
  if (await env.SNOWBALL_KV.get(`nick:${nick}`)) return fail('이미 있는 닉네임이에요', 409);

  let pw = String(body.pw || '').slice(0, MAX_PW);
  if (provider === 'local') {
    if (!PW_RE.test(pw)) {
      return fail('비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 해요');
    }
  } else {
    pw = makeToken();
  }

  const token = makeToken();
  await putUser(env, id, {
    pw, nick, gender, provider, token,
    score: 0, round: 0, at: null,
    bestRound: 0, plays: 0,
    joined: new Date().toISOString(),
  });
  await env.SNOWBALL_KV.put(`nick:${nick}`, id);

  return ok({
    id, nick, token, best: 0,
    stats: { best: 0, bestRound: 0, plays: 0 },
    scores: await getBoard(env),
  });
}
