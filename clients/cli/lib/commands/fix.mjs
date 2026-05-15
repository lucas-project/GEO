import { api } from '../api.mjs';
import { spinner, style, divider, heading } from '../ui.mjs';

const VALID = ['faq-schema', 'llms-txt', 'ai-summary', 'answer-first', 'product-schema', 'metadata'];

export async function runFix(auditId, type) {
  if (!auditId || !type) {
    throw new Error('Usage: geo fix <auditId> <type>\nValid types: ' + VALID.join(', '));
  }
  if (!VALID.includes(type)) {
    throw new Error(`Invalid fix type "${type}". Valid: ${VALID.join(', ')}`);
  }
  const spin = spinner(`Generating ${type}…`);
  const { artifact } = await api.post('/api/auto-fix', { auditId, type });
  spin.stop(style.green(`✓ Generated artifact ${artifact.id}`));

  console.log(heading(type));
  if (artifact.rationale) {
    console.log(style.gray(artifact.rationale));
    console.log();
  }
  console.log(artifact.content);
  console.log();
  console.log(divider());
}
