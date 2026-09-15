import { authFailure, authService, BootstrapSchema, sessionResponse } from '@modules/auth';
import { parseJsonBody, parseZod } from '@/lib/api-route';

/** Create the first owner and workspace. Requires GEO_BOOTSTRAP_INVITE_CODE. */
export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = parseZod(BootstrapSchema, body.body);
  if (!parsed.ok) return parsed.response;
  try {
    return sessionResponse(await authService.bootstrap(parsed.data));
  } catch (error) {
    return authFailure(error);
  }
}
