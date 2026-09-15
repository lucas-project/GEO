import { authFailure, authService, RegisterSchema, sessionResponse } from '@modules/auth';
import { parseJsonBody, parseZod } from '@/lib/api-route';

export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = parseZod(RegisterSchema, body.body);
  if (!parsed.ok) return parsed.response;
  try {
    return sessionResponse(await authService.register(parsed.data));
  } catch (error) {
    return authFailure(error);
  }
}
