import { SYNC_DEFAULTS } from '../account/config.js'

const LOCK_KEY_PREFIX = 'panduola_sync_lock:'
const DEFAULT_POLL_INTERVAL_MS = 250
const MAX_CLAIM_SETTLE_MS = 10
const MAX_ACCOUNT_KEY_LENGTH = 200

function createOwnerToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createAbortError() {
  const error = new Error('同步锁等待已取消')
  error.name = 'AbortError'
  return error
}

function normalizeAccountKey(accountKey) {
  if (
    typeof accountKey !== 'string' ||
    !accountKey ||
    accountKey.length > MAX_ACCOUNT_KEY_LENGTH ||
    /[\0\r\n]/.test(accountKey)
  ) {
    throw new TypeError('同步锁账号标识无效')
  }
  return accountKey
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function parseLease(rawValue) {
  if (!rawValue) return null
  try {
    const lease = JSON.parse(rawValue)
    if (
      typeof lease?.owner !== 'string' ||
      !Number.isFinite(lease.expiresAt)
    ) {
      return null
    }
    return lease
  } catch {
    return null
  }
}

function waitForRetry(delayMs, signal, setTimeoutFn, clearTimeoutFn) {
  if (signal?.aborted) return Promise.reject(createAbortError())
  return new Promise((resolve, reject) => {
    let timeoutId = null
    const abort = () => {
      clearTimeoutFn(timeoutId)
      signal?.removeEventListener('abort', abort)
      reject(createAbortError())
    }
    timeoutId = setTimeoutFn(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, delayMs)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export function createCrossTabLock({
  locks = globalThis.navigator?.locks,
  storage = getDefaultStorage(),
  ownerToken = createOwnerToken(),
  now = () => Date.now(),
  leaseMs = SYNC_DEFAULTS.webLockLeaseMs,
  heartbeatMs = SYNC_DEFAULTS.webLockHeartbeatMs,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
  setIntervalFn = globalThis.setInterval.bind(globalThis),
  clearIntervalFn = globalThis.clearInterval.bind(globalThis),
  onEvent = () => {}
} = {}) {
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
    throw new TypeError('leaseMs 必须是正整数')
  }
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs <= 0) {
    throw new TypeError('heartbeatMs 必须是正整数')
  }
  if (heartbeatMs >= leaseMs) {
    throw new TypeError('heartbeatMs 必须小于 leaseMs')
  }
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new TypeError('pollIntervalMs 必须是正整数')
  }
  if (typeof onEvent !== 'function') throw new TypeError('onEvent 必须是函数')

  function emit(event, context) {
    try {
      onEvent(event, context)
    } catch {
      // Lock diagnostics must never change the synchronization result.
    }
  }

  async function runWithWebLock(lockName, operation, signal) {
    return locks.request(lockName, { mode: 'exclusive', signal }, async () => {
      emit('web_lock.acquired', { lockName, mechanism: 'web-locks' })
      try {
        return await operation()
      } finally {
        emit('web_lock.released', { lockName, mechanism: 'web-locks' })
      }
    })
  }

  function readLease(lockKey) {
    return parseLease(storage.getItem(lockKey))
  }

  function tryAcquireLease(lockKey, acquisitionToken) {
    const current = readLease(lockKey)
    const currentTime = now()
    if (current && current.owner !== acquisitionToken && current.expiresAt > currentTime) {
      return { acquired: false, retryAt: current.expiresAt }
    }

    const candidate = {
      owner: acquisitionToken,
      expiresAt: currentTime + leaseMs
    }
    storage.setItem(lockKey, JSON.stringify(candidate))
    const confirmed = readLease(lockKey)
    const acquired = confirmed?.owner === acquisitionToken
    if (acquired && current && current.expiresAt <= currentTime) {
      emit('web_lock.lease_taken_over', { lockName: lockKey })
    }
    return { acquired, retryAt: confirmed?.expiresAt ?? currentTime + pollIntervalMs }
  }

  function startHeartbeat(lockKey, acquisitionToken) {
    return setIntervalFn(() => {
      try {
        const current = readLease(lockKey)
        if (current?.owner !== acquisitionToken) return
        storage.setItem(lockKey, JSON.stringify({
          owner: acquisitionToken,
          expiresAt: now() + leaseMs
        }))
      } catch {
        // A failed heartbeat only weakens the optimization; remote CAS remains authoritative.
      }
    }, heartbeatMs)
  }

  function releaseLease(lockKey, acquisitionToken, heartbeatId) {
    clearIntervalFn(heartbeatId)
    try {
      if (readLease(lockKey)?.owner === acquisitionToken) {
        storage.removeItem(lockKey)
      }
    } catch {
      // Lease cleanup is best effort and must not replace the operation result.
    } finally {
      emit('web_lock.released', { lockName: lockKey, mechanism: 'lease' })
    }
  }

  function releaseUnsettledLease(lockKey, acquisitionToken) {
    try {
      if (readLease(lockKey)?.owner === acquisitionToken) {
        storage.removeItem(lockKey)
      }
    } catch {
      // An abandoned claim expires naturally when storage cleanup is unavailable.
    }
  }

  async function runWithLease(lockName, operation, signal) {
    const lockKey = `${LOCK_KEY_PREFIX}${lockName}`
    const acquisitionToken = `${ownerToken}:${createOwnerToken()}`
    while (true) {
      if (signal?.aborted) throw createAbortError()
      const attempt = tryAcquireLease(lockKey, acquisitionToken)
      if (attempt.acquired) {
        const settleDelayMs = Math.min(
          pollIntervalMs,
          MAX_CLAIM_SETTLE_MS,
          Math.max(1, Math.floor(leaseMs / 4))
        )
        try {
          await waitForRetry(settleDelayMs, signal, setTimeoutFn, clearTimeoutFn)
        } catch (error) {
          releaseUnsettledLease(lockKey, acquisitionToken)
          throw error
        }
        const confirmed = readLease(lockKey)
        if (
          confirmed?.owner === acquisitionToken &&
          confirmed.expiresAt > now()
        ) {
          storage.setItem(lockKey, JSON.stringify({
            owner: acquisitionToken,
            expiresAt: now() + leaseMs
          }))
          break
        }
        continue
      }
      const remainingLeaseMs = Math.max(1, attempt.retryAt - now())
      const retryDelayMs = Math.min(pollIntervalMs, remainingLeaseMs)
      await waitForRetry(retryDelayMs, signal, setTimeoutFn, clearTimeoutFn)
    }

    emit('web_lock.acquired', { lockName: lockKey, mechanism: 'lease' })
    const heartbeatId = startHeartbeat(lockKey, acquisitionToken)
    try {
      return await operation()
    } finally {
      releaseLease(lockKey, acquisitionToken, heartbeatId)
    }
  }

  async function runExclusive(accountKey, operation, { signal } = {}) {
    const normalizedAccountKey = normalizeAccountKey(accountKey)
    if (typeof operation !== 'function') throw new TypeError('operation 必须是函数')
    if (signal?.aborted) throw createAbortError()

    const lockName = `panduola-sync:${normalizedAccountKey}`
    if (typeof locks?.request === 'function') {
      return runWithWebLock(lockName, operation, signal)
    }
    if (!storage) return operation()
    return runWithLease(lockName, operation, signal)
  }

  return Object.freeze({ runExclusive })
}
