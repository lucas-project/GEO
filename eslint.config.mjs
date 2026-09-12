import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@modules/*/*'],
              message:
                'Import modules via their public index.ts (e.g. @modules/geo-audit), not deep paths.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/shared/queue/register-handlers.ts',
      'src/instrumentation.ts',
      'src/modules/*/handlers.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

export default eslintConfig;
