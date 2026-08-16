import { defineConfig } from 'vitest/config'

// Fase 3 di docs/navigator-orizzonti-roadmap.md — prima infrastruttura di test del repository.
// `environment: 'node'` basta per ora: i primi moduli coperti (offRouteEngine, escapeEngine,
// locationModeDecider) sono già "pure, mockable, replayable" (nessuna dipendenza da DOM/React),
// lo stesso principio che li rende adatti al framework di simulazione GPS in
// lib/navigation/simulation/. `resolve.tsconfigPaths` risolve nativamente l'alias `@/*` già
// definito in tsconfig.json, senza bisogno del plugin vite-tsconfig-paths (supporto nativo di
// Vite da questa versione in poi).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
})
