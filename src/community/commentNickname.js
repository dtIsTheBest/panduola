export const COMMENT_NICKNAME_MAX_CHARACTERS = 20

const STORAGE_PREFIX = 'panduola_comment_nickname:'
const FALLBACK_NICKNAME = '成长伙伴'
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getCharacterLength(value) {
  return Array.from(value).length
}

export function normalizeCommentNickname(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  const length = getCharacterLength(normalized)
  if (length < 1 || length > COMMENT_NICKNAME_MAX_CHARACTERS) return null
  return normalized
}

export function maskEmailForNickname(email) {
  if (typeof email !== 'string') return FALLBACK_NICKNAME
  const normalized = email.trim().toLowerCase()
  const separator = normalized.lastIndexOf('@')
  if (separator <= 0 || separator === normalized.length - 1) {
    return FALLBACK_NICKNAME
  }
  const localCharacters = Array.from(normalized.slice(0, separator))
  const domain = normalized.slice(separator + 1)
  const maskedLocal = localCharacters.length === 1
    ? `${localCharacters[0]}***`
    : `${localCharacters[0]}***${localCharacters.at(-1)}`
  const candidate = `${maskedLocal}@${domain}`
  if (getCharacterLength(candidate) <= COMMENT_NICKNAME_MAX_CHARACTERS) {
    return candidate
  }
  const domainInitial = Array.from(domain)[0]
  const shortened = domainInitial ? `${maskedLocal}@${domainInitial}***` : maskedLocal
  return normalizeCommentNickname(shortened) ?? FALLBACK_NICKNAME
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function getStorageKey(userId) {
  return USER_ID_PATTERN.test(String(userId))
    ? `${STORAGE_PREFIX}${String(userId).toLowerCase()}`
    : null
}

export function createCommentNicknamePreference({
  storage = getDefaultStorage()
} = {}) {
  function read(userId, email) {
    const storageKey = getStorageKey(userId)
    if (storageKey && storage) {
      try {
        const saved = normalizeCommentNickname(storage.getItem(storageKey))
        if (saved) return saved
      } catch {
        // Nickname preference is optional and must not block commenting.
      }
    }
    return maskEmailForNickname(email)
  }

  function write(userId, nickname) {
    const storageKey = getStorageKey(userId)
    const normalized = normalizeCommentNickname(nickname)
    if (!storageKey || !normalized || !storage) return false
    try {
      storage.setItem(storageKey, normalized)
    } catch {
      return false
    }
    return normalized
  }

  function reset(userId) {
    const storageKey = getStorageKey(userId)
    if (!storageKey || !storage) return false
    try {
      storage.removeItem(storageKey)
      return true
    } catch {
      return false
    }
  }

  return Object.freeze({ read, write, reset })
}
