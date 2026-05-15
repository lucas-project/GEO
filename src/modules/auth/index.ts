/**
 * Auth — single-user dev session stub (blueprint: multi-tenant-ready later).
 */

export const DEV_OWNER_ID = 'local';

export interface DevSession {
  userId: string;
  ownerId: string;
}

export const authService = {
  getSession(): DevSession {
    return { userId: 'local-dev', ownerId: DEV_OWNER_ID };
  },
};
