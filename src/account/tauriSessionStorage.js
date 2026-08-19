import { AppError, ERROR_CODES } from './errors.js'

const STRONGHOLD_CLIENT_NAME = 'panduola-auth'
const VAULT_FILE_NAME = 'panduola-session.hold'
const STORAGE_KEY_PREFIX = 'supabase:'
const MAX_STORAGE_KEY_LENGTH = 256

function credentialStorageError(message, cause) {
  return new AppError(
    ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE,
    message,
    {
      cause,
      retryable: false,
      userMessageKey: ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE
    }
  )
}

function normalizeStorageKey(key) {
  if (
    typeof key !== 'string' ||
    !key ||
    key.length > MAX_STORAGE_KEY_LENGTH ||
    /[\0\r\n]/.test(key)
  ) {
    throw new TypeError('Session storage key 格式无效')
  }
  return `${STORAGE_KEY_PREFIX}${key}`
}

async function loadDefaultDependencies() {
  const [{ invoke }, { appLocalDataDir }, { Stronghold }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-stronghold')
  ])
  return {
    invoke,
    Stronghold,
    getVaultPath: async () => {
      const basePath = await appLocalDataDir()
      const separator = basePath.endsWith('/') || basePath.endsWith('\\') ? '' : '/'
      return `${basePath}${separator}${VAULT_FILE_NAME}`
    }
  }
}

export function createTauriSessionStorage({
  loadDependencies = loadDefaultDependencies,
  textEncoder = new TextEncoder(),
  textDecoder = new TextDecoder()
} = {}) {
  let initializationPromise = null

  async function initialize() {
    if (initializationPromise) return initializationPromise

    initializationPromise = (async () => {
      try {
        const dependencies = await loadDependencies()
        const [vaultPath, vaultPassword] = await Promise.all([
          dependencies.getVaultPath(),
          dependencies.invoke('get_or_create_stronghold_password')
        ])
        const stronghold = await dependencies.Stronghold.load(
          vaultPath,
          vaultPassword
        )

        let client
        try {
          client = await stronghold.loadClient(STRONGHOLD_CLIENT_NAME)
        } catch {
          client = await stronghold.createClient(STRONGHOLD_CLIENT_NAME)
          await stronghold.save()
        }
        return {
          stronghold,
          store: client.getStore()
        }
      } catch (error) {
        initializationPromise = null
        if (
          error instanceof AppError &&
          error.code === ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE
        ) {
          throw error
        }
        throw credentialStorageError('桌面端安全会话存储不可用', error)
      }
    })()

    return initializationPromise
  }

  async function getItem(key) {
    const storageKey = normalizeStorageKey(key)
    const { store } = await initialize()
    try {
      const encodedValue = await store.get(storageKey)
      if (encodedValue === null || encodedValue === undefined) return null
      return textDecoder.decode(new Uint8Array(encodedValue))
    } catch (error) {
      throw credentialStorageError('读取桌面端会话失败', error)
    }
  }

  async function setItem(key, value) {
    const storageKey = normalizeStorageKey(key)
    if (typeof value !== 'string') {
      throw new TypeError('Session storage value 必须是字符串')
    }

    const { stronghold, store } = await initialize()
    try {
      await store.insert(storageKey, Array.from(textEncoder.encode(value)))
      await stronghold.save()
    } catch (error) {
      throw credentialStorageError('保存桌面端会话失败', error)
    }
  }

  async function removeItem(key) {
    const storageKey = normalizeStorageKey(key)
    const { stronghold, store } = await initialize()
    try {
      await store.remove(storageKey)
      await stronghold.save()
    } catch (error) {
      throw credentialStorageError('删除桌面端会话失败', error)
    }
  }

  return Object.freeze({
    getItem,
    setItem,
    removeItem
  })
}
