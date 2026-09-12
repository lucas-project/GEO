import { z } from 'zod';

export const PRESENCE_PLATFORMS = [
  'reddit',
  'quora',
  'g2',
  'capterra',
  'trustpilot',
  'linkedin',
  'x',
  'youtube',
  'facebook',
  'instagram',
  'github',
  'xiaohongshu',
  'zhihu',
  'tiktok',
  'amazon',
  'whirlpool',
  'productreview',
  'ozbargain',
] as const;

export type PresencePlatform = (typeof PRESENCE_PLATFORMS)[number];

export const PlatformLinkSchema = z.object({
  linked: z.boolean(),
  urls: z.array(z.string()),
  /** Site pages where this platform link was found (paths or full URLs). */
  foundOnPages: z.array(z.string()).optional(),
});

export type PlatformLink = z.infer<typeof PlatformLinkSchema>;

export const NapSignalsSchema = z.object({
  hasContactPage: z.boolean(),
  phoneFound: z.boolean(),
  emailFound: z.boolean(),
});

export type NapSignals = z.infer<typeof NapSignalsSchema>;

const PlatformsRecordSchema = z.object({
  reddit: PlatformLinkSchema,
  quora: PlatformLinkSchema,
  g2: PlatformLinkSchema,
  capterra: PlatformLinkSchema,
  trustpilot: PlatformLinkSchema,
  linkedin: PlatformLinkSchema,
  x: PlatformLinkSchema,
  youtube: PlatformLinkSchema,
  facebook: PlatformLinkSchema,
  instagram: PlatformLinkSchema,
  github: PlatformLinkSchema,
  xiaohongshu: PlatformLinkSchema,
  zhihu: PlatformLinkSchema,
  tiktok: PlatformLinkSchema,
  amazon: PlatformLinkSchema,
  whirlpool: PlatformLinkSchema,
  productreview: PlatformLinkSchema,
  ozbargain: PlatformLinkSchema,
});

export const PresenceSignalsSchema = z.object({
  platforms: PlatformsRecordSchema,
  sameAsUrls: z.array(z.string()),
  sameAsCount: z.number().int(),
  hasPricingPage: z.boolean(),
  hasComparePage: z.boolean(),
  hasPrimaryCta: z.boolean(),
  hasTrustSection: z.boolean(),
  hasProductOffers: z.boolean(),
  napSignals: NapSignalsSchema,
});

export type PresenceSignals = z.infer<typeof PresenceSignalsSchema>;

export const PLATFORM_LABELS: Record<PresencePlatform, string> = {
  reddit: 'Reddit',
  quora: 'Quora',
  g2: 'G2',
  capterra: 'Capterra',
  trustpilot: 'Trustpilot',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  github: 'GitHub',
  xiaohongshu: 'Xiaohongshu (小红书)',
  zhihu: 'Zhihu',
  tiktok: 'TikTok',
  amazon: 'Amazon',
  whirlpool: 'Whirlpool',
  productreview: 'ProductReview.com.au',
  ozbargain: 'OzBargain',
};
