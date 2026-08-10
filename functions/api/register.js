import {
  ok, fail, clean, readJson, getUser, putUser, getBoard, issueUserSession,
  appendLoginHistory,
  MAX_NICK, MAX_PW, ID_RE, PW_RE, GENDERS,
} from '../_shared.js';

// provider:'naver' 는 네이버 로그인 화면(아직 골격만) 경로다.
// 실제 연동 전에는 일반 가입처럼 화면에서 입력한 비밀번호를 그대로 저장한다.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail('잘못된 형식');

  const provider = body.provider === 'naver' ? 'naver' : 'local';
  // 길이는 ID_RE 가 잡는다. 여기서 20자로 자르면 21자짜리가 조용히 통과한다.
  const id = clean(body.id, 100);
  const nick = clean(body.nick, MAX_NICK) || id;
  const gender = GENDERS.includes(body.gender) ? body.gender : '';

  if (!id) return fail('아이디를 입력해주세요');
  if (!ID_RE.test(id)) return fail('아이디는 5~20자의 영문 소문자, 숫자, 특수기호(_),(-)만 쓸 수 있어요');
  if (!nick) return fail('닉네임을 입력해주세요');
  if (!gender) return fail('성별을 선택해주세요');
  if (await getUser(env, id)) return fail('이미 있는 아이디예요', 409);
  if (await env.SNOWBALL_KV.get(`nick:${nick}`)) return fail('이미 있는 닉네임이에요', 409);

  // 비밀번호 규칙은 일반 가입과 네이버 가입이 똑같다.
  let pw = String(body.pw || '').slice(0, MAX_PW);
  if (!pw) return fail('비밀번호를 입력해주세요');
  if (!PW_RE.test(pw)) {
    return fail('비밀번호는 8~16자, 영문·숫자·특수문자를 모두 포함해야 해요');
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
