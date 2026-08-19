import { AppError, ERROR_CODES } from './errors.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const OTP_PATTERN = /^\d{6}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeEmail(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (
    !normalized ||
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    throw new AppError(ERROR_CODES.INVALID_EMAIL, '请输入有效的邮箱地址')
  }
  return normalized
}

function normalizeOtp(code) {
  const normalized = typeof code === 'string' ? code.trim() : ''
  if (!OTP_PATTERN.test(normalized)) {
    throw new AppError(ERROR_CODES.INVALID_OTP, '请输入六位数字验证码')
  }
  return normalized
}

function getErrorText(error) {
  return `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase()
}

function isOffline(error) {
  return globalThis.navigator?.onLine === false ||
    error instanceof TypeError ||
    getErrorText(error).includes('fetch')
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' ||
    getErrorText(error).includes('timed out')
}

function getRetryAfter(error) {
  const seconds = Number(error?.retryAfter ?? error?.retry_after)
  return Number.isFinite(seconds) ? Math.max(0, seconds) : null
}

function mapAuthError(error, operation) {
  if (error instanceof AppError) return error

  const text = getErrorText(error)
  const status = Number(error?.status)
  if (isTimeout(error)) {
    return new AppError(
      ERROR_CODES.REMOTE_UNAVAILABLE,
      '认证请求超时，请稍后重试',
      { cause: error, retryable: true }
    )
  }
  if (isOffline(error)) {
    return new AppError(ERROR_CODES.OFFLINE, '当前网络不可用', {
      cause: error,
      retryable: true
    })
  }
  if (
    status === 429 ||
    text.includes('rate limit') ||
    text.includes('over_request_rate_limit')
  ) {
    return new AppError(ERROR_CODES.OTP_RATE_LIMITED, '验证码请求过于频繁', {
      cause: error,
      retryable: true,
      retryAfter: getRetryAfter(error)
    })
  }
  if (text.includes('expired')) {
    return new AppError(ERROR_CODES.OTP_EXPIRED, '验证码已过期', {
      cause: error
    })
  }
  if (
    operation === 'verify-otp' &&
    (status === 400 || text.includes('token') || text.includes('otp'))
  ) {
    return new AppError(ERROR_CODES.INVALID_OTP, '验证码无效', {
      cause: error
    })
  }
  if (status === 401 || status === 403) {
    const code = operation === 'restore-session'
      ? ERROR_CODES.SESSION_EXPIRED
      : ERROR_CODES.UNAUTHORIZED
    return new AppError(code, '登录状态无效，请重新登录', { cause: error })
  }
  return new AppError(ERROR_CODES.REMOTE_UNAVAILABLE, '认证服务暂时不可用', {
    cause: error,
    retryable: !Number.isFinite(status) || status >= 500
  })
}

function toAccountSession(rawSession, now = Date.now()) {
  if (!rawSession) return null

  const userId = rawSession.user?.id
  const email = rawSession.user?.email
  if (!UUID_PATTERN.test(String(userId)) || typeof email !== 'string') {
    throw new AppError(
      ERROR_CODES.SESSION_EXPIRED,
      '登录状态缺少有效用户信息'
    )
  }

  const expiresAtSeconds = Number(rawSession.expires_at)
  if (
    Number.isFinite(expiresAtSeconds) &&
    expiresAtSeconds * 1000 <= now
  ) {
    throw new AppError(ERROR_CODES.SESSION_EXPIRED, '登录状态已过期')
  }

  return Object.freeze({
    userId: String(userId).toLowerCase(),
    email: normalizeEmail(email),
    expiresAt: Number.isFinite(expiresAtSeconds)
      ? new Date(expiresAtSeconds * 1000).toISOString()
      : null
  })
}

function resolveGetClient({ client, clientProvider }) {
  if (client) return async () => client
  if (typeof clientProvider?.getClient === 'function') {
    return () => clientProvider.getClient()
  }
  throw new TypeError('认证适配器需要 Supabase client 或 clientProvider')
}

export function createAuthAdapter({
  client,
  clientProvider,
  now = () => Date.now(),
  onListenerError = globalThis.reportError?.bind(globalThis) ?? (() => {})
} = {}) {
  const getClient = resolveGetClient({ client, clientProvider })
  if (typeof onListenerError !== 'function') {
    throw new TypeError('onListenerError 必须是函数')
  }

  async function restoreSession() {
    const supabase = await getClient()
    let result
    try {
      result = await supabase.auth.getSession()
    } catch (error) {
      throw mapAuthError(error, 'restore-session')
    }
    if (result.error) throw mapAuthError(result.error, 'restore-session')
    return toAccountSession(result.data?.session ?? null, now())
  }

  async function requestOtp(email) {
    const normalizedEmail = normalizeEmail(email)
    const supabase = await getClient()
    let result
    try {
      result = await supabase.auth.signInWithOtp({ email: normalizedEmail })
    } catch (error) {
      throw mapAuthError(error, 'request-otp')
    }
    if (result.error) throw mapAuthError(result.error, 'request-otp')
  }

  async function verifyOtp(email, code) {
    const normalizedEmail = normalizeEmail(email)
    const token = normalizeOtp(code)
    const supabase = await getClient()
    let result
    try {
      result = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: 'email'
      })
    } catch (error) {
      throw mapAuthError(error, 'verify-otp')
    }
    if (result.error) throw mapAuthError(result.error, 'verify-otp')
    if (!result.data?.session) {
      throw new AppError(
        ERROR_CODES.SESSION_EXPIRED,
        '认证成功但未建立登录状态'
      )
    }
    return toAccountSession(result.data.session, now())
  }

  async function signOut() {
    const supabase = await getClient()
    let result
    try {
      result = await supabase.auth.signOut()
    } catch (error) {
      throw mapAuthError(error, 'sign-out')
    }
    if (result.error) throw mapAuthError(result.error, 'sign-out')
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('认证订阅 listener 必须是函数')
    }

    let isActive = true
    let subscription = null
    const notify = (session, event, error) => {
      try {
        listener(session, event, error)
      } catch (listenerError) {
        try {
          onListenerError(listenerError)
        } catch {
          // A diagnostic sink must never re-enter the auth SDK callback.
        }
      }
    }
    getClient()
      .then(supabase => {
        if (!isActive) return
        const result = supabase.auth.onAuthStateChange((event, rawSession) => {
          if (!isActive) return
          let accountSession = null
          let sessionError = null
          try {
            accountSession = toAccountSession(rawSession, now())
          } catch (error) {
            sessionError = mapAuthError(error, 'auth-event')
          }
          notify(accountSession, event, sessionError)
        })
        subscription = result?.data?.subscription ?? null
        if (!isActive) subscription?.unsubscribe()
      })
      .catch(error => {
        if (isActive) {
          notify(null, 'ERROR', mapAuthError(error, 'auth-event'))
        }
      })

    return () => {
      isActive = false
      subscription?.unsubscribe()
    }
  }

  return Object.freeze({
    restoreSession,
    requestOtp,
    verifyOtp,
    signOut,
    subscribe
  })
}
