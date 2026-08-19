export const ERROR_CODES = Object.freeze({
  CONFIG_MISSING: 'CONFIG_MISSING',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  OFFLINE: 'OFFLINE',
  REMOTE_UNAVAILABLE: 'REMOTE_UNAVAILABLE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  INVALID_REMOTE_DATA: 'INVALID_REMOTE_DATA',
  UNSUPPORTED_SCHEMA: 'UNSUPPORTED_SCHEMA',
  SNAPSHOT_TOO_LARGE: 'SNAPSHOT_TOO_LARGE',
  REMOTE_DATA_CORRUPTED: 'REMOTE_DATA_CORRUPTED',
  LOCAL_DATA_CORRUPTED: 'LOCAL_DATA_CORRUPTED',
  LOCAL_REVISION_CONFLICT: 'LOCAL_REVISION_CONFLICT',
  LOCAL_STORAGE_FAILED: 'LOCAL_STORAGE_FAILED',
  CREDENTIAL_STORAGE_UNAVAILABLE: 'CREDENTIAL_STORAGE_UNAVAILABLE',
  RECOVERY_WRITE_FAILED: 'RECOVERY_WRITE_FAILED'
})

export class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.retryable = Boolean(options.retryable)
    this.userMessageKey = options.userMessageKey || code
    this.retryAfter = Number.isFinite(options.retryAfter)
      ? Math.max(0, options.retryAfter)
      : null
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        configurable: true,
        writable: true,
        enumerable: false
      })
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      userMessageKey: this.userMessageKey,
      retryAfter: this.retryAfter
    }
  }
}

export function isAppError(error) {
  return error instanceof AppError
}

export function toAppError(error, fallback = {}) {
  if (isAppError(error)) return error

  const code = fallback.code || ERROR_CODES.REMOTE_UNAVAILABLE
  const message = fallback.message || '操作失败，请稍后重试'
  return new AppError(code, message, {
    retryable: fallback.retryable,
    userMessageKey: fallback.userMessageKey,
    retryAfter: fallback.retryAfter,
    cause: error
  })
}
