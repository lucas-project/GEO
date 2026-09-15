import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { config } from '@shared/config';
import { prisma } from '@shared/database/client';

export const DEV_OWNER_ID = 'local';
const PASSWORD_PARAMS = 'scrypt:N=16384,r=8,p=1,keylen=64';
const KEY_LENGTH = 64;

export interface AuthSession {
  userId: string;
  ownerId: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface SessionIssue {
  token: string;
  expiresAt: Date;
}

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function secretHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(secretHash(a), 'hex');
  const right = Buffer.from(secretHash(b), 'hex');
  return timingSafeEqual(left, right);
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function passwordRecord(password: string) {
  const salt = randomBytes(16);
  const key = await derivePassword(password, salt);
  return {
    passwordHash: key.toString('base64'),
    passwordSalt: salt.toString('base64'),
    passwordParams: PASSWORD_PARAMS,
  };
}

async function verifyPassword(password: string, record: {
  passwordHash: string;
  passwordSalt: string;
  passwordParams: string;
}): Promise<boolean> {
  if (record.passwordParams !== PASSWORD_PARAMS) return false;
  const expected = Buffer.from(record.passwordHash, 'base64');
  const actual = await derivePassword(password, Buffer.from(record.passwordSalt, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function issueSession(userId: string, workspaceId: string): Promise<SessionIssue> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.auth.sessionDays * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({ data: { tokenHash: secretHash(token), userId, workspaceId, expiresAt } });
  return { token, expiresAt };
}

async function sessionForToken(token: string): Promise<AuthSession | null> {
  const row = await prisma.authSession.findFirst({
    where: { tokenHash: secretHash(token), expiresAt: { gt: new Date() } },
  });
  if (!row) return null;
  const membership = await prisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId: row.userId, workspaceId: row.workspaceId } },
    select: { role: true },
  });
  if (!membership || !['owner', 'editor', 'viewer'].includes(membership.role)) return null;
  if (row.lastSeenAt.getTime() < Date.now() - 60 * 60 * 1000) {
    await prisma.authSession.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
  }
  return { userId: row.userId, ownerId: row.workspaceId, role: membership.role as AuthSession['role'] };
}

export const authService = {
  async getSession(): Promise<AuthSession | null> {
    let token: string | undefined;
    try {
      token = (await cookies()).get(config.auth.cookieName)?.value;
    } catch {
      // Route-unit tests have no Next request store. This never grants a
      // production session because allowDevSession is false there.
      if (config.auth.allowDevSession) return { userId: 'local-dev', ownerId: DEV_OWNER_ID, role: 'owner' };
      return null;
    }
    if (token) return sessionForToken(token);
    if (config.auth.allowDevSession) return { userId: 'local-dev', ownerId: DEV_OWNER_ID, role: 'owner' };
    return null;
  },

  async bootstrap(input: { email: string; password: string; workspaceName: string; bootstrapCode: string }): Promise<SessionIssue> {
    if (!config.auth.bootstrapInviteCode || !equalSecret(input.bootstrapCode, config.auth.bootstrapInviteCode)) {
      throw new AuthError('invalid bootstrap code', 403);
    }
    const password = await passwordRecord(input.password);
    const account = await prisma.$transaction(async (tx) => {
      if (await tx.user.count()) throw new AuthError('bootstrap has already been completed', 409);
      const workspace = await tx.workspace.create({ data: { name: input.workspaceName } });
      const user = await tx.user.create({ data: { email: input.email, ...password } });
      await tx.workspaceMembership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'owner' } });
      return { userId: user.id, workspaceId: workspace.id };
    });
    return issueSession(account.userId, account.workspaceId);
  },

  async register(input: { email: string; password: string; inviteCode: string }): Promise<SessionIssue> {
    const codeHash = secretHash(input.inviteCode);
    const password = await passwordRecord(input.password);
    const account = await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
        throw new AuthError('email is already registered', 409);
      }
      const invite = await tx.invite.findUnique({ where: { codeHash } });
      if (!invite || (invite.expiresAt && invite.expiresAt <= new Date())) {
        throw new AuthError('invalid or expired invite', 403);
      }
      if (invite.email && invite.email !== input.email) throw new AuthError('invite is for a different email', 403);
      const consumed = await tx.invite.updateMany({
        where: { id: invite.id, uses: { lt: invite.maxUses } },
        data: { uses: { increment: 1 } },
      });
      if (consumed.count !== 1) throw new AuthError('invite has no remaining uses', 409);
      const user = await tx.user.create({ data: { email: input.email, ...password } });
      await tx.workspaceMembership.create({ data: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role } });
      return { userId: user.id, workspaceId: invite.workspaceId };
    });
    return issueSession(account.userId, account.workspaceId);
  },

  async login(input: { email: string; password: string; workspaceId?: string }): Promise<SessionIssue> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verifyPassword(input.password, user))) throw new AuthError('invalid email or password', 401);
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId: user.id, ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) throw new AuthError('workspace access was not found', 403);
    return issueSession(user.id, membership.workspaceId);
  },

  async logout(): Promise<void> {
    const store = await cookies();
    const token = store.get(config.auth.cookieName)?.value;
    if (token) await prisma.authSession.deleteMany({ where: { tokenHash: secretHash(token) } });
  },

  async createInvite(session: AuthSession, input: { email?: string; role?: AuthSession['role']; maxUses?: number; expiresInDays?: number }) {
    if (session.role !== 'owner') throw new AuthError('owner role is required', 403);
    const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 14) * 24 * 60 * 60 * 1000);
    await prisma.invite.create({
      data: {
        codeHash: secretHash(code), workspaceId: session.ownerId, email: input.email,
        role: input.role ?? 'viewer', maxUses: input.maxUses ?? 1, expiresAt,
      },
    });
    return { code, expiresAt };
  },

  async createWorkspace(session: AuthSession, name: string): Promise<{ id: string; name: string }> {
    const workspace = await prisma.workspace.create({ data: { name } });
    await prisma.workspaceMembership.create({
      data: { userId: session.userId, workspaceId: workspace.id, role: 'owner' },
    });
    return workspace;
  },

  async switchWorkspace(session: AuthSession, workspaceId: string): Promise<SessionIssue> {
    const membership = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: session.userId, workspaceId } },
      select: { userId: true },
    });
    if (!membership) throw new AuthError('workspace access was not found', 403);
    return issueSession(session.userId, workspaceId);
  },
};

export function applySessionCookie(response: NextResponse, session: SessionIssue): void {
  response.cookies.set(config.auth.cookieName, session.token, {
    httpOnly: true, secure: config.env === 'production', sameSite: 'lax', path: '/', expires: session.expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(config.auth.cookieName, '', {
    httpOnly: true, secure: config.env === 'production', sameSite: 'lax', path: '/', maxAge: 0,
  });
}
