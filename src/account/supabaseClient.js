import { AppError, ERROR_CODES } from './errors.js'
import { SYNC_DEFAULTS } from './config.js'

async function loadDefaultCreateClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient
}

function configError(config) {
  if (config?.configError instanceof AppError) return config.configError
  return new AppError(
    ERROR_CODES.CONFIG_MISSING,
    '云同步配置不可用，本地功能仍可正常使用'
  )
}

function createTimeoutFetch(fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('当前运行环境不支持 fetch')
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('requestTimeoutMs 必须是正整数')
  }

  return async (input, init = {}) => {
    const controller = new AbortController()
    let didTimeout = false
    const forwardAbort = () => controller.abort(init.signal?.reason)
    if (init.signal?.aborted) {
      forwardAbort()
    } else {
      init.signal?.addEventListener('abort', forwardAbort, { once: true })
    }
    const timeoutId = globalThis.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, timeoutMs)

    try {
      const response = await fetchImpl(input, {
        ...init,
        signal: controller.signal
      })
      const requestMethod = String(
        init.method ?? (
          typeof globalThis.Request === 'function' &&
          input instanceof globalThis.Request
            ? input.method
            : 'GET'
        )
      ).toUpperCase()
      const hasNullBody = response.body === null ||
        requestMethod === 'HEAD' ||
        response.status === 204 ||
        response.status === 205 ||
        response.status === 304
      const responseBody = hasNullBody
        ? null
        : await response.arrayBuffer()
      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    } catch (error) {
      if (!didTimeout) throw error
      const timeoutError = new Error('Supabase request timed out', {
        cause: error
      })
      timeoutError.name = 'TimeoutError'
      throw timeoutError
    } finally {
      globalThis.clearTimeout(timeoutId)
      init.signal?.removeEventListener('abort', forwardAbort)
    }
  }
}

export function createSupabaseClientProvider({
  config,
  storage,
  loadCreateClient = loadDefaultCreateClient,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  requestTimeoutMs = config?.defaults?.requestTimeoutMs ??
    SYNC_DEFAULTS.requestTimeoutMs
} = {}) {
  let clientPromise = null

  async function getClient() {
    if (!config?.isSyncAvailable) throw configError(config)
    if (clientPromise) return clientPromise

    clientPromise = (async () => {
      try {
        const createClient = await loadCreateClient()
        if (typeof createClient !== 'function') {
          throw new TypeError('Supabase createClient 不可用')
        }

        const auth = {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false
        }
        if (storage) auth.storage = storage

        return createClient(
          config.supabaseUrl,
          config.publishableKey,
          {
            auth,
            global: {
              fetch: createTimeoutFetch(fetchImpl, requestTimeoutMs)
            }
          }
        )
      } catch (error) {
        clientPromise = null
        if (error instanceof AppError) throw error
        throw new AppError(
          ERROR_CODES.REMOTE_UNAVAILABLE,
          '无法初始化云同步客户端',
          { cause: error, retryable: true }
        )
      }
    })()

    return clientPromise
  }

  return Object.freeze({ getClient })
}
