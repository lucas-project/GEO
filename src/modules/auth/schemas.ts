import { z } from 'zod';

const EmailSchema = z.string().trim().email().max(320).transform((email) => email.toLowerCase());
const PasswordSchema = z.string().min(12).max(256);

export const BootstrapSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  workspaceName: z.string().trim().min(2).max(120),
  bootstrapCode: z.string().min(1).max(512),
});

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  inviteCode: z.string().min(1).max(512),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  workspaceId: z.string().cuid().optional(),
});

export const CreateInviteSchema = z.object({
  email: EmailSchema.optional(),
  role: z.enum(['owner', 'editor', 'viewer']).default('viewer'),
  maxUses: z.number().int().min(1).max(100).default(1),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});

export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const SwitchWorkspaceSchema = z.object({
  workspaceId: z.string().cuid(),
});
