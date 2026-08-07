import { ok, getBoard } from '../_shared.js';

export async function onRequestGet({ env }) {
  return ok({ scores: await getBoard(env) });
}
