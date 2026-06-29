const KEY = 'dtrek_nav_stack'
const MAX_ENTRIES = 30

function readStack(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function writeStack(stack: string[]): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX_ENTRIES)))
}

export function trackNavigation(pathname: string): void {
  const stack = readStack()
  if (stack[stack.length - 1] === pathname) return
  stack.push(pathname)
  writeStack(stack)
}

export function canGoBackInApp(): boolean {
  return readStack().length > 1
}

export function popNavigation(): void {
  const stack = readStack()
  stack.pop()
  writeStack(stack)
}
