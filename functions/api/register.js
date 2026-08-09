import {
  ok, fail, clean, readJson, getUser, putUser, getBoard, issueUserSession,
  appendLoginHistory,
  MAX_ID, MAX_NICK, MAX_PW, PW_RE, GENDERS,
} from '../_shared.js';

// provider:'naver' 는 네이버 로그인 화면(아직 골격만) 경로다.
// 실제 연동 전에는 일반 가입처럼 화면에서 입력한 비밀번호를 그대로 저장한다.
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
  } else if (!pw) {
    return fail('비밀번호를 입력해주세요');
  }

  const user = {
    pw, nick, gender, provider,
    score: 0, round: 0, at: null,
    bestRound: 0, plays: 0,
    joined: new Date().toISOString(),
  };
  const expiresAt = issueUserSession(user);
  appendLoginHistory(user, true, provider, '가입 후 로그인');
  await putUser(env, id, user);
  await env.SNOWBALL_KV.put(`nick:${nick}`, id);

  return ok({
    id, nick, token: user.token, expiresAt, best: 0,
    stats: { best: 0, bestRound: 0, plays: 0 },
    scores: await getBoard(env),
  });
}
