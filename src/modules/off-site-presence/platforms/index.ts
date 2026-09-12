import { probeCapterra } from './capterra';
import { probeG2 } from './g2';
import { probeQuora } from './quora';
import { probeReddit } from './reddit';
import { probeSiteSearch } from './site-search';
import { probeTrustpilot } from './trustpilot';
import {
  probeOzBargain,
  probeProductReview,
  probeWhirlpool,
} from './au-discussion-sites';
import type { OffSitePlatformAdapter } from './types';

export const PLATFORM_ADAPTERS: OffSitePlatformAdapter[] = [
  { id: 'whirlpool', probe: probeWhirlpool },
  { id: 'productreview', probe: probeProductReview },
  { id: 'ozbargain', probe: probeOzBargain },
  { id: 'reddit', probe: probeReddit },
  { id: 'quora', probe: probeQuora },
  { id: 'g2', probe: probeG2 },
  { id: 'capterra', probe: probeCapterra },
  { id: 'trustpilot', probe: probeTrustpilot },
  { id: 'site_search', probe: probeSiteSearch },
];

export {
  probeReddit,
  probeQuora,
  probeG2,
  probeCapterra,
  probeTrustpilot,
  probeSiteSearch,
  probeWhirlpool,
  probeProductReview,
  probeOzBargain,
};
export type { ProbeContext, FetchPageFn, OffSitePlatformAdapter } from './types';
