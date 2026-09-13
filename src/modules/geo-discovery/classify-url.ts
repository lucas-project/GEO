import type { PageArchetype } from '@modules/geo-audit';

const UTILITY_PATH =
  /\/(wp-admin|wp-json|cart|checkout|login|signup|sign-in|sign-up|account|feed|xmlrpc)(\/|$)/i;

const ARCHETYPE_PATTERNS: { archetype: PageArchetype; patterns: RegExp[] }[] = [
  {
    archetype: 'faq',
    patterns: [/\/faq(s)?(\/|$)/i, /\/help(\/|$)/i, /[?&]faq/i, /\bfaq\b/i],
  },
  {
    archetype: 'qa',
    patterns: [/\/questions?(\/|$)/i, /\/q-?a(\/|$)/i, /\/support(\/|$)/i, /\/answers?(\/|$)/i],
  },
  {
    archetype: 'glossary',
    patterns: [/\/glossary(\/|$)/i, /\/terms(\/|$)/i, /\/definitions?(\/|$)/i],
  },
  {
    archetype: 'comparison',
    patterns: [/\/vs(\/|$|-)/i, /\/compare(\/|$)/i, /\/comparison(s)?(\/|$)/i, /best-.+-for/i],
  },
  {
    archetype: 'documentation',
    patterns: [
      /\/docs?(\/|$)/i,
      /\/documentation(\/|$)/i,
      /\/guide(s)?(\/|$)/i,
      /\/kb(\/|$)/i,
      /\/learn(\/|$)/i,
      /\/manual(\/|$)/i,
    ],
  },
  {
    archetype: 'product',
    patterns: [
      /\/product(s)?(\/|$)/i,
      /\/pricing(\/|$)/i,
      /\/features?(\/|$)/i,
      /\/services?(\/|$)/i,
      /\/solutions?(\/|$)/i,
    ],
  },
  {
    archetype: 'blog',
    patterns: [
      /\/blog(\/|$)/i,
      /\/news(\/|$)/i,
      /\/articles?(\/|$)/i,
      /\/\d{4}\/\d{2}\//,
      /\/posts?(\/|$)/i,
    ],
  },
];

export function classifyUrl(url: string, anchorTexts: string[] = []): PageArchetype {
  let pathname = '/';
  try {
    pathname = new URL(url).pathname;
  } catch {
    return 'content';
  }

  if (pathname === '/' || pathname === '') return 'homepage';
  if (UTILITY_PATH.test(pathname)) return 'utility';

  const pathHaystack = pathname.toLowerCase();
  const anchorHaystack = anchorTexts.join(' ').toLowerCase();

  for (const { archetype, patterns } of ARCHETYPE_PATTERNS) {
    if (patterns.some((p) => p.test(pathHaystack) || (anchorHaystack && p.test(anchorHaystack)))) {
      return archetype;
    }
  }

  if (/\/page\/\d+/i.test(pathname) || /\/p\/\d+/i.test(pathname)) return 'blog';
  if (/\b(how-to|what-is|why-|when-|guide-to)\b/i.test(pathname)) return 'documentation';

  return 'content';
}
