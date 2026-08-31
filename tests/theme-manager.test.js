import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_STORAGE_KEY,
  applyTheme,
  initializeTheme,
  normalizeThemeId,
  readStoredTheme
} from '../src/theme/themeManager.js'

function createStorage(initialValue = null) {
  const values = new Map()
  if (initialValue !== null) values.set(THEME_STORAGE_KEY, initialValue)
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: key => values.get(key)
  }
}

test('三套主题定义稳定且默认主题保持当前色调', () => {
  assert.deepEqual(THEMES.map(theme => theme.id), ['growth', 'paper', 'sky'])
  assert.equal(DEFAULT_THEME_ID, 'growth')
  assert.equal(Object.isFrozen(THEMES), true)
  assert.equal(THEMES.every(theme => Object.isFrozen(theme) && Object.isFrozen(theme.colors)), true)
})

test('非法或损坏的主题值回退默认主题', () => {
  assert.equal(normalizeThemeId('paper'), 'paper')
  assert.equal(normalizeThemeId('unknown'), DEFAULT_THEME_ID)
  assert.equal(normalizeThemeId(null), DEFAULT_THEME_ID)
  assert.equal(readStoredTheme(createStorage('unknown')), DEFAULT_THEME_ID)
})

test('应用主题会更新根节点并独立持久化', () => {
  const root = { dataset: {} }
  const storage = createStorage()

  assert.equal(applyTheme('paper', { root, storage }), 'paper')
  assert.equal(root.dataset.theme, 'paper')
  assert.equal(storage.value(THEME_STORAGE_KEY), 'paper')
})

test('初始化读取已保存主题且存储异常时安全降级', () => {
  const root = { dataset: {} }
  const storage = createStorage('sky')
  assert.equal(initializeTheme({ root, storage }), 'sky')
  assert.equal(root.dataset.theme, 'sky')

  const failedStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') }
  }
  assert.doesNotThrow(() => initializeTheme({ root, storage: failedStorage }))
  assert.equal(root.dataset.theme, DEFAULT_THEME_ID)
})
