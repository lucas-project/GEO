import { PAGE_ARCHETYPES, type PageArchetype } from './schemas';

/** Display order for grouped page picker (high GEO intent first). */
export const ARCHETYPE_DISPLAY_ORDER: PageArchetype[] = [...PAGE_ARCHETYPES];

export const ARCHETYPE_LABELS: Record<PageArchetype, string> = {
  homepage: 'Home',
  faq: 'FAQ',
  qa: 'Q&A',
  glossary: 'Glossary',
  comparison: 'Compare',
  documentation: 'Docs',
  product: 'Product',
  blog: 'Blog',
  content: 'Content',
  utility: 'Utility',
};
