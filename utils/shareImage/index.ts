// Canvas-based image generation for social sharing (client-side only)
// Split into per-image submodules (canvasHelpers, tileHelpers, one file per
// generate*Image function) — this barrel re-exports the same public API so
// every existing `@/utils/shareImage` import keeps working unchanged.

export type { ShareFormat } from './canvasHelpers'
export { generateActivityImage, type ActivityShareOpts } from './activityImage'
export { generateStatsImage, type StatsShareOpts } from './statsImage'
export { generateComparisonImage, type ComparisonShareOpts } from './comparisonImage'
export { generateMapImage, type MapShareOpts } from './mapImage'
