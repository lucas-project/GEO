export {
  PRESENCE_PLATFORMS,
  PresenceSignalsSchema,
  PlatformLinkSchema,
  PLATFORM_LABELS,
  type PresencePlatform,
  type PresenceSignals,
  type PlatformLink,
} from './schemas';
export { analyzePresenceSignals, type AnalyzePresenceInput } from './analyze';
export { matchPlatformUrl, isPricingPath, isComparePath, isContactPath } from './platforms';
export { extractSameAsUrls } from './same-as';
