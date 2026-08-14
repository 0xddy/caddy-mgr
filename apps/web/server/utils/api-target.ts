export function buildApiTarget(baseUrl: string, path: string, search = ''): string {
  return `${baseUrl.replace(/\/$/, '')}/api/${path}${search}`
}
