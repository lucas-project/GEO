/**
 * Billing — tier model only (no payment integration in skeleton).
 */

export const BILLING_TIERS = ['free', 'pro', 'enterprise'] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

export const billingService = {
  tiers: BILLING_TIERS,
  getDefaultTier(): BillingTier {
    return 'free';
  },
};
