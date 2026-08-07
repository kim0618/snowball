import { ok, clean, MAX_NICK } from '../_shared.js';

export async function onRequestGet({ request, env }) {
  const nick = clean(new URL(request.url).searchParams.get('nick') || '', MAX_NICK);
  if (!nick) return ok({ available: false });
  const taken = await env.SNOWBALL_KV.get(`nick:${nick}`);
  return ok({ available: !taken });
}
