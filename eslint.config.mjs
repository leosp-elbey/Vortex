// Phase 14T — Native flat ESLint config.
//
// Pre-14T: this file used `FlatCompat` from `@eslint/eslintrc` to wrap
// `next/core-web-vitals` and `next/typescript` for ESLint 9.x consumption.
// `eslint-plugin-react`'s recommended config contains a circular plugin
// reference (`configs.flat -> ... -> plugins.react -> configs`), which
// FlatCompat's validator tries to JSON.stringify and crashes with:
//
//   TypeError: Converting circular structure to JSON
//
// Phase 14T: `eslint-config-next` v16.2.4 ships flat-config-native arrays
// at the `core-web-vitals` and `typescript` subpath exports — already-shaped
// `Linter.Config[]` arrays that we spread directly without going through
// the legacy compat layer. No more circular-JSON crash; lint runs cleanly.

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'mobile/**',
      'scripts/**',
      'supabase/**',
      'next-env.d.ts',
    ],
  },
]

export default config
