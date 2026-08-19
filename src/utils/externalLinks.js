const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

export function normalizeSafeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value.trim())
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function isSafeExternalUrl(value) {
  return normalizeSafeExternalUrl(value) !== null
}

export function openExternalLink(value, openWindow = window.open.bind(window)) {
  const safeUrl = normalizeSafeExternalUrl(value)
  if (!safeUrl) return false

  const openedWindow = openWindow(safeUrl, '_blank', 'noopener,noreferrer')
  if (openedWindow) openedWindow.opener = null
  return true
}
