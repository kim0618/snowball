import { ok, clean, getUser, MAX_ID } from '../_shared.js';

export async function onRequestGet({ request, env }) {
  const id = clean(new URL(request.url).searchParams.get('id') || '', MAX_ID);
  if (!id) return ok({ available: false });
  return ok({ available: !(await getUser(env, id)) });
}
