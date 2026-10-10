export const COMMUNITY_REPOSITORY_KEY = Symbol('community-repository')

export const COMMUNITY_ERROR_CODES = Object.freeze({
  NOT_CONFIGURED: 'COMMUNITY_NOT_CONFIGURED',
  UNAUTHORIZED: 'COMMUNITY_UNAUTHORIZED',
  INVALID_INPUT: 'COMMUNITY_INVALID_INPUT',
  LIMIT_EXCEEDED: 'COMMUNITY_LIMIT_EXCEEDED',
  NETWORK_ERROR: 'COMMUNITY_NETWORK_ERROR',
  STORAGE_ERROR: 'COMMUNITY_STORAGE_ERROR',
  NOT_FOUND: 'COMMUNITY_NOT_FOUND'
})

const ERROR_MESSAGES = Object.freeze({
  COMMUNITY_NOT_CONFIGURED: '社区功能尚未完成配置。',
  COMMUNITY_UNAUTHORIZED: '请先登录后再进行此操作。',
  COMMUNITY_INVALID_INPUT: '提交的内容不符合要求。',
  COMMUNITY_LIMIT_EXCEEDED: '已达到当前功能的数量或大小上限。',
  COMMUNITY_NETWORK_ERROR: '社区服务暂时不可用，请稍后重试。',
  COMMUNITY_STORAGE_ERROR: '照片服务暂时不可用，请稍后重试。',
  COMMUNITY_NOT_FOUND: '目标内容不存在或已被删除。'
})

const COMMENT_LIMIT = 50
const PHOTO_LIMIT = 24
const SIGNED_URL_SECONDS = 3600
const MAXIMUM_CAPTION_CHARACTERS = 80
const MAXIMUM_NICKNAME_CHARACTERS = 20
const MAXIMUM_COMMENT_CHARACTERS = 300
const MAXIMUM_PHOTO_BYTES = 5 * 1024 * 1024
const MAXIMUM_PHOTO_DIMENSION = 1920
const PHOTO_BUCKET = 'family-photos'
const PHOTO_MIME_TYPE = 'image/webp'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class CommunityRepositoryError extends Error {
  constructor(code, options = {}) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.COMMUNITY_NETWORK_ERROR)
    this.name = 'CommunityRepositoryError'
    this.code = code
    this.retryable = options.retryable === true
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        configurable: true,
        writable: true,
        enumerable: false
      })
    }
  }
}

function countCharacters(value) {
  return Array.from(value).length
}

function validateText(value, minimum, maximum) {
  if (typeof value !== 'string') {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.INVALID_INPUT)
  }
  const normalized = value.trim()
  const length = countCharacters(normalized)
  if (length < minimum || length > maximum) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.INVALID_INPUT)
  }
  return normalized
}

function validateLimit(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.INVALID_INPUT)
  }
  return value
}

function validateUuid(value) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.INVALID_INPUT)
  }
  return String(value).toLowerCase()
}

function getErrorText(error) {
  return `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase()
}

function mapRemoteError(error, { storage = false } = {}) {
  if (error instanceof CommunityRepositoryError) return error
  const status = Number(error?.status ?? error?.statusCode)
  const text = getErrorText(error)
  if (
    status === 401 || status === 403 || error?.code === '42501' ||
    text.includes('row-level security') || text.includes('jwt')
  ) {
    return new CommunityRepositoryError(COMMUNITY_ERROR_CODES.UNAUTHORIZED, {
      cause: error
    })
  }
  if (error?.code === '22023' || status === 400) {
    return new CommunityRepositoryError(COMMUNITY_ERROR_CODES.INVALID_INPUT, {
      cause: error
    })
  }
  if (text.includes('limit') || text.includes('twenty fifth')) {
    return new CommunityRepositoryError(COMMUNITY_ERROR_CODES.LIMIT_EXCEEDED, {
      cause: error
    })
  }
  const code = storage
    ? COMMUNITY_ERROR_CODES.STORAGE_ERROR
    : COMMUNITY_ERROR_CODES.NETWORK_ERROR
  return new CommunityRepositoryError(code, {
    cause: error,
    retryable: !Number.isFinite(status) || status === 408 || status === 429 || status >= 500
  })
}

function validateTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.NETWORK_ERROR, {
      retryable: true
    })
  }
  return value
}

function mapComment(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.NETWORK_ERROR, {
      retryable: true
    })
  }
  try {
    const id = validateUuid(row.id)
    const nickname = validateText(row.nickname, 1, MAXIMUM_NICKNAME_CHARACTERS)
    const content = validateText(row.content, 1, MAXIMUM_COMMENT_CHARACTERS)
    if (typeof row.can_delete !== 'boolean') {
      throw new Error('invalid delete permission')
    }
    return Object.freeze({
      id,
      nickname,
      content,
      createdAt: validateTimestamp(row.created_at),
      canDelete: row.can_delete
    })
  } catch (error) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.NETWORK_ERROR, {
      cause: error,
      retryable: true
    })
  }
}

function parsePositiveInteger(value, maximum) {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.NETWORK_ERROR, {
      retryable: true
    })
  }
  return parsed
}

function mapPhotoMetadata(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.NETWORK_ERROR, {
      retryable: true
    })
  }
  try {
    const id = validateUuid(row.id)
    const objectPath = String(row.object_path ?? '')
    if (!objectPath || row.mime_type !== PHOTO_MIME_TYPE) {
      throw new Error('invalid photo identity')
    }
    return Object.freeze({
      id,
      objectPath,
      caption: validateText(String(row.caption ?? ''), 0, MAXIMUM_CAPTION_CHARACTERS),
      mimeType: PHOTO_MIME_TYPE,
      width: parsePositiveInteger(row.width, MAXIMUM_PHOTO_DIMENSION),
      height: parsePositiveInteger(row.height, MAXIMUM_PHOTO_DIMENSION),
      byteSize: parsePositiveInteger(row.byte_size, MAXIMUM_PHOTO_BYTES),
      createdAt: validateTimestamp(row.created_at)
    })
  } catch (error) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.NETWORK_ERROR, {
      cause: error,
      retryable: true
    })
  }
}

function validateSignedUrl(value) {
  try {
    const url = new URL(String(value))
    if (!['http:', 'https:'].includes(url.protocol) || !url.searchParams.has('token')) {
      throw new Error('unsigned url')
    }
    return url.toString()
  } catch (error) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.STORAGE_ERROR, {
      cause: error,
      retryable: true
    })
  }
}

function getRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

function validateProcessedPhoto({ file, caption, width, height } = {}) {
  const normalizedCaption = validateText(String(caption ?? ''), 0, MAXIMUM_CAPTION_CHARACTERS)
  if (
    file?.type !== PHOTO_MIME_TYPE ||
    !Number.isSafeInteger(file?.size) ||
    file.size < 1 || file.size > MAXIMUM_PHOTO_BYTES ||
    !Number.isSafeInteger(width) || width < 1 || width > MAXIMUM_PHOTO_DIMENSION ||
    !Number.isSafeInteger(height) || height < 1 || height > MAXIMUM_PHOTO_DIMENSION
  ) {
    throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.INVALID_INPUT)
  }
  return Object.freeze({ file, caption: normalizedCaption, width, height })
}

export function createCommunityRepository({
  clientProvider,
  enabled = true,
  randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
} = {}) {
  if (typeof clientProvider?.getClient !== 'function') {
    throw new TypeError('社区仓库需要 Supabase clientProvider')
  }
  if (enabled && typeof randomUUID !== 'function') {
    throw new TypeError('当前环境不支持安全随机标识')
  }
  const photoPaths = new Map()

  async function getClient() {
    if (!enabled) {
      throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.NOT_CONFIGURED)
    }
    try {
      return await clientProvider.getClient()
    } catch (error) {
      throw mapRemoteError(error)
    }
  }

  async function requireUser() {
    const client = await getClient()
    let result
    try {
      result = await client.auth.getSession()
    } catch (error) {
      throw mapRemoteError(error)
    }
    if (result?.error) throw mapRemoteError(result.error)
    const userId = result?.data?.session?.user?.id
    if (!UUID_PATTERN.test(String(userId))) {
      throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.UNAUTHORIZED)
    }
    return Object.freeze({ client, userId: String(userId).toLowerCase() })
  }

  async function runRpc(client, name, params) {
    let result
    try {
      result = await client.rpc(name, params)
    } catch (error) {
      throw mapRemoteError(error)
    }
    if (result?.error) throw mapRemoteError(result.error)
    return result?.data
  }

  async function listComments({ limit = COMMENT_LIMIT } = {}) {
    const safeLimit = validateLimit(limit, COMMENT_LIMIT)
    const client = await getClient()
    const data = await runRpc(client, 'list_community_comments', {
      p_limit: safeLimit
    })
    if (!Array.isArray(data)) throw mapRemoteError(new Error('invalid comment list'))
    return Object.freeze(data.map(mapComment))
  }

  async function createComment({ nickname, content } = {}) {
    const safeNickname = validateText(nickname, 1, MAXIMUM_NICKNAME_CHARACTERS)
    const safeContent = validateText(content, 1, MAXIMUM_COMMENT_CHARACTERS)
    const { client } = await requireUser()
    const data = await runRpc(client, 'create_community_comment', {
      p_nickname: safeNickname,
      p_content: safeContent
    })
    const row = getRpcRow(data)
    if (!row) throw mapRemoteError(new Error('missing created comment'))
    return mapComment(row)
  }

  async function deleteComment(commentId) {
    const safeCommentId = validateUuid(commentId)
    const { client } = await requireUser()
    const data = await runRpc(client, 'delete_community_comment', {
      p_comment_id: safeCommentId
    })
    return data === true
  }

  function replacePhotoPaths(userId, photos) {
    const prefix = `${userId}:`
    for (const key of photoPaths.keys()) {
      if (key.startsWith(prefix)) photoPaths.delete(key)
    }
    for (const photo of photos) {
      photoPaths.set(`${prefix}${photo.id}`, photo.objectPath)
    }
  }

  async function listOwnPhotos({ limit = PHOTO_LIMIT } = {}) {
    const safeLimit = validateLimit(limit, PHOTO_LIMIT)
    const { client, userId } = await requireUser()
    const data = await runRpc(client, 'list_own_family_photos', {
      p_limit: safeLimit
    })
    if (!Array.isArray(data)) throw mapRemoteError(new Error('invalid photo list'))
    const metadata = data.map(mapPhotoMetadata)
    if (metadata.length === 0) {
      replacePhotoPaths(userId, metadata)
      return Object.freeze([])
    }

    let signedResult
    try {
      const paths = metadata.map(photo => photo.objectPath)
      signedResult = await client.storage.from(PHOTO_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_SECONDS)
    } catch (error) {
      throw mapRemoteError(error, { storage: true })
    }
    if (signedResult?.error) {
      throw mapRemoteError(signedResult.error, { storage: true })
    }
    if (!Array.isArray(signedResult?.data) || signedResult.data.length !== metadata.length) {
      throw mapRemoteError(new Error('invalid signed url list'), { storage: true })
    }
    const signedUrlByPath = new Map(signedResult.data.map(item => [
      String(item?.path ?? ''),
      validateSignedUrl(item?.signedUrl)
    ]))
    const photos = metadata.map(photo => {
      const signedUrl = signedUrlByPath.get(photo.objectPath)
      if (!signedUrl) {
        throw mapRemoteError(new Error('missing signed url'), { storage: true })
      }
      const { objectPath: _privatePath, ...publicPhoto } = photo
      return Object.freeze({ ...publicPhoto, signedUrl })
    })
    replacePhotoPaths(userId, metadata)
    return Object.freeze(photos)
  }

  async function cancelReservation(client, photoId) {
    let lastError = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await client.rpc('cancel_own_family_photo', {
          p_photo_id: photoId
        })
        if (!result?.error) return null
        lastError = result.error
      } catch (error) {
        lastError = error
      }
    }
    return lastError
  }

  async function signUploadedPhoto(client, photo) {
    let signedResult
    try {
      signedResult = await client.storage.from(PHOTO_BUCKET)
        .createSignedUrl(photo.objectPath, SIGNED_URL_SECONDS)
    } catch (error) {
      throw mapRemoteError(error, { storage: true })
    }
    if (signedResult?.error) {
      throw mapRemoteError(signedResult.error, { storage: true })
    }
    const signedUrl = validateSignedUrl(signedResult?.data?.signedUrl)
    const { objectPath: _privatePath, ...publicPhoto } = photo
    return Object.freeze({ ...publicPhoto, signedUrl })
  }

  async function uploadOwnPhoto(input) {
    const photoInput = validateProcessedPhoto(input)
    const { client, userId } = await requireUser()
    const objectId = validateUuid(randomUUID())
    const objectPath = `${userId}/${objectId}.webp`
    const reservationData = await runRpc(client, 'reserve_own_family_photo', {
      p_object_path: objectPath,
      p_caption: photoInput.caption,
      p_mime_type: PHOTO_MIME_TYPE,
      p_width: photoInput.width,
      p_height: photoInput.height,
      p_byte_size: photoInput.file.size
    })
    const reservation = getRpcRow(reservationData)
    if (reservation?.allowed === false) {
      throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.LIMIT_EXCEEDED)
    }
    const reservedPhoto = mapPhotoMetadata(reservation)

    let uploadResult
    try {
      uploadResult = await client.storage.from(PHOTO_BUCKET).upload(
        objectPath,
        photoInput.file,
        {
          contentType: PHOTO_MIME_TYPE,
          cacheControl: String(SIGNED_URL_SECONDS),
          upsert: false
        }
      )
    } catch (error) {
      // A thrown network error is an unknown outcome; list recovery decides
      // whether the object reached Storage.
      throw mapRemoteError(error, { storage: true })
    }
    if (uploadResult?.error) {
      const cancelError = await cancelReservation(client, reservedPhoto.id)
      if (cancelError) {
        const cause = new AggregateError(
          [uploadResult.error, cancelError],
          'photo upload and reservation cleanup failed'
        )
        throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.STORAGE_ERROR, {
          cause,
          retryable: true
        })
      }
      throw mapRemoteError(uploadResult.error, { storage: true })
    }

    const finalizedData = await runRpc(client, 'finalize_own_family_photo', {
      p_photo_id: reservedPhoto.id
    })
    const finalizedRow = getRpcRow(finalizedData)
    if (!finalizedRow) throw mapRemoteError(new Error('photo finalize failed'))
    const finalizedPhoto = mapPhotoMetadata(finalizedRow)
    photoPaths.set(`${userId}:${finalizedPhoto.id}`, finalizedPhoto.objectPath)
    return signUploadedPhoto(client, finalizedPhoto)
  }

  async function deleteOwnPhoto(photoId) {
    const safePhotoId = validateUuid(photoId)
    const { client, userId } = await requireUser()
    const mapKey = `${userId}:${safePhotoId}`
    const objectPath = photoPaths.get(mapKey)
    if (!objectPath) {
      throw new CommunityRepositoryError(COMMUNITY_ERROR_CODES.NOT_FOUND)
    }

    let storageResult
    try {
      storageResult = await client.storage.from(PHOTO_BUCKET).remove([objectPath])
    } catch (error) {
      throw mapRemoteError(error, { storage: true })
    }
    if (storageResult?.error) {
      throw mapRemoteError(storageResult.error, { storage: true })
    }
    const data = await runRpc(client, 'delete_own_family_photo', {
      p_photo_id: safePhotoId
    })
    const result = getRpcRow(data)
    photoPaths.delete(mapKey)
    return result?.deleted === true
  }

  return Object.freeze({
    isAvailable: enabled,
    listComments,
    createComment,
    deleteComment,
    listOwnPhotos,
    uploadOwnPhoto,
    deleteOwnPhoto
  })
}
