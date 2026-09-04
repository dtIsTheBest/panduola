export const THEME_STORAGE_KEY = 'panduola:appearance-theme'
export const DEFAULT_THEME_ID = 'growth'

export const THEMES = Object.freeze([
  {
    id: 'growth',
    name: '岁序清新',
    description: '薄荷绿与暖金，适合轻松日常浏览',
    colors: ['#1f766c', '#f2ad4a', '#f3f7f6']
  },
  {
    id: 'paper',
    name: '暖杏书卷',
    description: '米杏纸感与陶土色，适合安静阅读',
    colors: ['#8a5a3b', '#c9913a', '#f7f1e8']
  },
  {
    id: 'sky',
    name: '云岚静蓝',
    description: '雾蓝与淡紫，营造理性舒缓的专注感',
    colors: ['#4a63a6', '#8a68a8', '#f3f5fb']
  },
  {
    id: 'cyber',
    name: '霓虹夜航',
    description: '深海黑蓝与电光青紫，赛博朋克夜间氛围',
    colors: ['#070b18', '#22d3ee', '#ff3cac']
  }
].map(theme => Object.freeze({
  ...theme,
  colors: Object.freeze(theme.colors)
})))

const THEME_IDS = new Set(THEMES.map(theme => theme.id))

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function getDefaultRoot() {
  return globalThis.document?.documentElement ?? null
}

export function normalizeThemeId(themeId) {
  return typeof themeId === 'string' && THEME_IDS.has(themeId)
    ? themeId
    : DEFAULT_THEME_ID
}

export function readStoredTheme(storage = getDefaultStorage()) {
  try {
    return normalizeThemeId(storage?.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function getAppliedTheme(root = getDefaultRoot()) {
  return normalizeThemeId(root?.dataset?.theme)
}

export function applyTheme(themeId, options = {}) {
  const normalizedThemeId = normalizeThemeId(themeId)
  const root = Object.hasOwn(options, 'root') ? options.root : getDefaultRoot()
  const storage = Object.hasOwn(options, 'storage') ? options.storage : getDefaultStorage()
  const shouldPersist = options.persist !== false

  if (root?.dataset) {
    root.dataset.theme = normalizedThemeId
  } else {
    root?.setAttribute?.('data-theme', normalizedThemeId)
  }

  if (shouldPersist) {
    try {
      storage?.setItem(THEME_STORAGE_KEY, normalizedThemeId)
    } catch {
      // Appearance remains usable for the current page when storage is unavailable.
    }
  }
  return normalizedThemeId
}

export function initializeTheme(options = {}) {
  const storage = Object.hasOwn(options, 'storage') ? options.storage : getDefaultStorage()
  const themeId = readStoredTheme(storage)
  return applyTheme(themeId, { ...options, storage })
}
