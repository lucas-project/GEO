import type { Heading } from '../schemas';

const QUESTION_WORDS =
  /^(what|how|why|when|where|who|which|can|do|does|is|are|should|will)\b|^(什么|如何|为什么|为何|何时|哪里|谁|是否|可以|能否|怎样)/i;

export interface QuestionHeadingSignals {
  questionHeadingCount: number;
  h2h3Count: number;
  questionRatio: number;
}

export function extractQuestionHeadings(headings: Heading[]): QuestionHeadingSignals {
  const h2h3 = headings.filter((h) => h.level === 2 || h.level === 3);
  let questionHeadingCount = 0;
  for (const h of h2h3) {
    const t = h.text.trim();
    const minLength = /[\u3400-\u9fff]/.test(t) ? 4 : 8;
    if ((t.endsWith('?') || t.endsWith('？')) && t.length >= minLength) {
      questionHeadingCount++;
    } else if (QUESTION_WORDS.test(t) && t.length >= minLength) {
      questionHeadingCount++;
    }
  }
  const h2h3Count = h2h3.length;
  return {
    questionHeadingCount,
    h2h3Count,
    questionRatio: h2h3Count > 0 ? questionHeadingCount / h2h3Count : 0,
  };
}
