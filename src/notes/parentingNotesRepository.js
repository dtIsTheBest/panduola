export const PARENTING_NOTES_REPOSITORY_KEY = Symbol('parenting-notes-repository')

export const NOTE_LIMITS = Object.freeze({
  notes: 100,
  titleCharacters: 80,
  contentCharacters: 5000,
  imagesPerNote: 4,
  imageBytes: 5 * 1024 * 1024,
  imageDimension: 1920
})

export const NOTE_ERROR_CODES = Object.freeze({
  NOT_CONFIGURED: 'NOTES_NOT_CONFIGURED',
  UNAUTHORIZED: 'NOTES_UNAUTHORIZED',
  INVALID_INPUT: 'NOTES_INVALID_INPUT',
  LIMIT_EXCEEDED: 'NOTES_LIMIT_EXCEEDED',
  NETWORK_ERROR: 'NOTES_NETWORK_ERROR',
  STORAGE_ERROR: 'NOTES_STORAGE_ERROR',
  NOT_FOUND: 'NOTES_NOT_FOUND'
})

const ERROR_MESSAGES = Object.freeze({
  NOTES_NOT_CONFIGURED: '育儿手记服务尚未完成配置。',
  NOTES_UNAUTHORIZED: '请先登录后再使用育儿手记。',
  NOTES_INVALID_INPUT: '手记内容或图片不符合要求。',
  NOTES_LIMIT_EXCEEDED: '已达到手记或图片数量上限。',
  NOTES_NETWORK_ERROR: '育儿手记暂时无法连接，请稍后重试。',
  NOTES_STORAGE_ERROR: '手记图片暂时无法保存，请稍后重试。',
  NOTES_NOT_FOUND: '这篇手记不存在或已被删除。'
})

const NOTE_TABLE = 'parenting_notes'
const IMAGE_TABLE = 'parenting_note_images'
const IMAGE_BUCKET = 'parenting-note-images'
const IMAGE_MIME_TYPE = 'image/webp'
const SIGNED_URL_SECONDS = 3600
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class ParentingNotesRepositoryError extends Error {
  constructor(code, options = {}) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.NOTES_NETWORK_ERROR)
    this.name = 'ParentingNotesRepositoryError'
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
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.INVALID_INPUT)
  }
  const normalized = value.trim()
  const length = countCharacters(normalized)
  if (length < minimum || length > maximum) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.INVALID_INPUT)
  }
  return normalized
}

function validateUuid(value) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.INVALID_INPUT)
  }
  return String(value).toLowerCase()
}

function validateTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NETWORK_ERROR, { retryable: true })
  }
  return value
}

function validatePositiveInteger(value, maximum) {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NETWORK_ERROR, { retryable: true })
  }
  return parsed
}

function getErrorText(error) {
  return `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase()
}

function mapRemoteError(error, { storage = false } = {}) {
  if (error instanceof ParentingNotesRepositoryError) return error
  const status = Number(error?.status ?? error?.statusCode)
  const text = getErrorText(error)
  if (
    status === 401 || status === 403 || error?.code === '42501' ||
    text.includes('row-level security') || text.includes('jwt')
  ) {
    return new ParentingNotesRepositoryError(NOTE_ERROR_CODES.UNAUTHORIZED, { cause: error })
  }
  if (error?.code === '23514' || text.includes('limit')) {
    return new ParentingNotesRepositoryError(NOTE_ERROR_CODES.LIMIT_EXCEEDED, { cause: error })
  }
  if (error?.code === '22023' || status === 400) {
    return new ParentingNotesRepositoryError(NOTE_ERROR_CODES.INVALID_INPUT, { cause: error })
  }
  const code = storage ? NOTE_ERROR_CODES.STORAGE_ERROR : NOTE_ERROR_CODES.NETWORK_ERROR
  return new ParentingNotesRepositoryError(code, {
    cause: error,
    retryable: !Number.isFinite(status) || status === 408 || status === 429 || status >= 500
  })
}

function validateSignedUrl(value) {
  try {
    const url = new URL(String(value))
    if (!['http:', 'https:'].includes(url.protocol) || !url.searchParams.has('token')) {
      throw new Error('unsigned url')
    }
    return url.toString()
  } catch (error) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.STORAGE_ERROR, {
      cause: error,
      retryable: true
    })
  }
}

function validateProcessedImage(image) {
  if (
    image?.file?.type !== IMAGE_MIME_TYPE ||
    !Number.isSafeInteger(image.file.size) ||
    image.file.size < 1 || image.file.size > NOTE_LIMITS.imageBytes ||
    !Number.isSafeInteger(image.width) || image.width < 1 || image.width > NOTE_LIMITS.imageDimension ||
    !Number.isSafeInteger(image.height) || image.height < 1 || image.height > NOTE_LIMITS.imageDimension
  ) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.INVALID_INPUT)
  }
  return image
}

function mapImage(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NETWORK_ERROR, { retryable: true })
  }
  try {
    const objectPath = String(row.object_path ?? '')
    if (!objectPath || row.mime_type !== IMAGE_MIME_TYPE || row.status !== 'ready') {
      throw new Error('invalid image metadata')
    }
    return Object.freeze({
      id: validateUuid(row.id),
      objectPath,
      mimeType: IMAGE_MIME_TYPE,
      width: validatePositiveInteger(row.width, NOTE_LIMITS.imageDimension),
      height: validatePositiveInteger(row.height, NOTE_LIMITS.imageDimension),
      byteSize: validatePositiveInteger(row.byte_size, NOTE_LIMITS.imageBytes),
      sortOrder: Number.isSafeInteger(row.sort_order) ? row.sort_order : 0,
      createdAt: validateTimestamp(row.created_at)
    })
  } catch (error) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NETWORK_ERROR, {
      cause: error,
      retryable: true
    })
  }
}

function mapPendingImage(row) {
  try {
    if (row?.status !== 'pending') throw new Error('invalid pending image status')
    return Object.freeze({
      id: validateUuid(row.id),
      objectPath: String(row.object_path ?? ''),
      sortOrder: Number.isSafeInteger(row.sort_order) ? row.sort_order : 0
    })
  } catch (error) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NETWORK_ERROR, {
      cause: error,
      retryable: true
    })
  }
}

function mapNote(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NETWORK_ERROR, { retryable: true })
  }
  try {
    const rawImages = Array.isArray(row.parenting_note_images) ? row.parenting_note_images : []
    const images = rawImages.filter(image => image.status === 'ready')
      .map(mapImage)
      .sort((left, right) => left.sortOrder - right.sortOrder)
    const pendingImages = rawImages.filter(image => image.status === 'pending')
      .map(mapPendingImage)
    return Object.freeze({
      id: validateUuid(row.id),
      title: validateText(row.title, 1, NOTE_LIMITS.titleCharacters),
      content: validateText(row.content, 1, NOTE_LIMITS.contentCharacters),
      createdAt: validateTimestamp(row.created_at),
      updatedAt: validateTimestamp(row.updated_at),
      images: Object.freeze(images),
      pendingImages: Object.freeze(pendingImages)
    })
  } catch (error) {
    if (error instanceof ParentingNotesRepositoryError) throw error
    throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NETWORK_ERROR, {
      cause: error,
      retryable: true
    })
  }
}

export function createParentingNotesRepository({
  clientProvider,
  enabled = true,
  randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
} = {}) {
  if (typeof clientProvider?.getClient !== 'function') {
    throw new TypeError('育儿手记仓库需要 Supabase clientProvider')
  }
  if (enabled && typeof randomUUID !== 'function') {
    throw new TypeError('当前环境不支持安全随机标识')
  }

  async function getClient() {
    if (!enabled) {
      throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NOT_CONFIGURED)
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
      throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.UNAUTHORIZED)
    }
    return Object.freeze({ client, userId: String(userId).toLowerCase() })
  }

  async function runQuery(query, options = {}) {
    let result
    try {
      result = await query
    } catch (error) {
      throw mapRemoteError(error, options)
    }
    if (result?.error) throw mapRemoteError(result.error, options)
    return result?.data
  }

  async function recoverImages(client) {
    await runQuery(client.rpc('recover_own_parenting_note_images'))
  }

  async function signNotes(client, notes) {
    const paths = notes.flatMap(note => note.images.map(image => image.objectPath))
    if (paths.length === 0) {
      return Object.freeze(notes.map(note => {
        const { pendingImages, ...publicNote } = note
        return Object.freeze({
          ...publicNote,
          images: Object.freeze([]),
          pendingImageCount: pendingImages.length
        })
      }))
    }
    const data = await runQuery(
      client.storage.from(IMAGE_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS),
      { storage: true }
    )
    if (!Array.isArray(data) || data.length !== paths.length) {
      throw mapRemoteError(new Error('invalid signed url list'), { storage: true })
    }
    const signedUrlByPath = new Map(data.map(item => [
      String(item?.path ?? ''),
      validateSignedUrl(item?.signedUrl)
    ]))
    return Object.freeze(notes.map(note => {
      const { pendingImages, ...publicNote } = note
      return Object.freeze({
        ...publicNote,
        images: Object.freeze(note.images.map(image => {
          const signedUrl = signedUrlByPath.get(image.objectPath)
          if (!signedUrl) throw mapRemoteError(new Error('missing signed url'), { storage: true })
          const { objectPath: _privatePath, ...publicImage } = image
          return Object.freeze({ ...publicImage, signedUrl })
        })),
        pendingImageCount: pendingImages.length
      })
    }))
  }

  async function listOwnNotes() {
    const { client } = await requireUser()
    await recoverImages(client)
    const query = client.from(NOTE_TABLE)
      .select(`
        id,title,content,created_at,updated_at,
        parenting_note_images!left(
          id,object_path,mime_type,width,height,byte_size,sort_order,created_at,status
        )
      `)
      .order('updated_at', { ascending: false })
      .limit(NOTE_LIMITS.notes)
    const data = await runQuery(query)
    if (!Array.isArray(data)) throw mapRemoteError(new Error('invalid note list'))
    return signNotes(client, data.map(mapNote))
  }

  async function uploadImage(client, userId, noteId, image, sortOrder) {
    const processed = validateProcessedImage(image)
    const imageId = validateUuid(randomUUID())
    const objectPath = `${userId}/${noteId}/${imageId}.webp`
    const metadata = {
      id: imageId,
      note_id: noteId,
      object_path: objectPath,
      mime_type: IMAGE_MIME_TYPE,
      width: processed.width,
      height: processed.height,
      byte_size: processed.file.size,
      sort_order: sortOrder,
      status: 'pending'
    }
    await runQuery(client.from(IMAGE_TABLE).insert(metadata))
    let uploadResult
    try {
      uploadResult = await client.storage.from(IMAGE_BUCKET).upload(
        objectPath,
        processed.file,
        {
          contentType: IMAGE_MIME_TYPE,
          cacheControl: String(SIGNED_URL_SECONDS),
          upsert: false
        }
      )
    } catch (error) {
      // A thrown network error has an unknown outcome. Keep the pending row so
      // the recovery RPC can finalize an object that reached Storage.
      throw mapRemoteError(error, { storage: true })
    }
    if (uploadResult?.error) {
      await runQuery(client.from(IMAGE_TABLE).delete().eq('id', imageId)).catch(() => {})
      throw mapRemoteError(uploadResult.error, { storage: true })
    }
    if (!uploadResult?.data) {
      throw mapRemoteError(new Error('missing upload result'), { storage: true })
    }
    let finalizeResult
    try {
      finalizeResult = await client.from(IMAGE_TABLE).update({ status: 'ready' }).eq('id', imageId)
    } catch (error) {
      // Keep the reservation on an unknown database outcome. Recovery can
      // verify the Storage object and converge the row to ready later.
      throw mapRemoteError(error)
    }
    if (finalizeResult?.error) {
      let removalResult
      try {
        removalResult = await client.storage.from(IMAGE_BUCKET).remove([objectPath])
      } catch (error) {
        throw mapRemoteError(error, { storage: true })
      }
      if (removalResult?.error) throw mapRemoteError(removalResult.error, { storage: true })
      await runQuery(client.from(IMAGE_TABLE).delete().eq('id', imageId)).catch(() => {})
      throw mapRemoteError(finalizeResult.error)
    }
  }

  async function uploadImages(client, userId, noteId, images, sortOrders) {
    let failedImageCount = 0
    for (let index = 0; index < images.length; index += 1) {
      try {
        await uploadImage(client, userId, noteId, images[index], sortOrders[index])
      } catch {
        failedImageCount += 1
      }
    }
    return failedImageCount
  }

  async function getOwnNoteRow(client, noteId) {
    const query = client.from(NOTE_TABLE)
      .select(`
        id,title,content,created_at,updated_at,
        parenting_note_images!left(
          id,object_path,mime_type,width,height,byte_size,sort_order,created_at,status
        )
      `)
      .eq('id', noteId)
      .maybeSingle()
    const data = await runQuery(query)
    if (!data) throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.NOT_FOUND)
    return data
  }

  async function getOwnNote(client, noteId) {
    await recoverImages(client)
    const note = mapNote(await getOwnNoteRow(client, noteId))
    const signedNotes = await signNotes(client, [note])
    return signedNotes[0]
  }

  function validateNoteInput({ title, content, images = [] } = {}) {
    if (!Array.isArray(images) || images.length > NOTE_LIMITS.imagesPerNote) {
      throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.INVALID_INPUT)
    }
    return Object.freeze({
      title: validateText(title, 1, NOTE_LIMITS.titleCharacters),
      content: validateText(content, 1, NOTE_LIMITS.contentCharacters),
      images: images.map(validateProcessedImage)
    })
  }

  async function createNote(input) {
    const noteInput = validateNoteInput(input)
    const { client, userId } = await requireUser()
    const noteId = input?.id ? validateUuid(input.id) : validateUuid(randomUUID())
    await runQuery(client.from(NOTE_TABLE).upsert({
      id: noteId,
      title: noteInput.title,
      content: noteInput.content
    }, { onConflict: 'id' }))
    let current
    try {
      await recoverImages(client)
      current = mapNote(await getOwnNoteRow(client, noteId))
      const usedOrders = new Set([
        ...current.images.map(image => image.sortOrder),
        ...current.pendingImages.map(image => image.sortOrder)
      ])
      const sortOrders = Array.from(
        { length: NOTE_LIMITS.imagesPerNote },
        (_value, index) => index
      ).filter(order => !usedOrders.has(order)).slice(0, noteInput.images.length)
      if (sortOrders.length !== noteInput.images.length) {
        throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.LIMIT_EXCEEDED)
      }
      await uploadImages(client, userId, noteId, noteInput.images, sortOrders)
    } catch {
      const imageMutationFailed = noteInput.images.length > 0
      return Object.freeze({
        note: null,
        failedImageCount: noteInput.images.length,
        pendingImageCount: 0,
        imageMutationFailed,
        refreshFailed: !imageMutationFailed
      })
    }
    try {
      const note = await getOwnNote(client, noteId)
      const newReadyCount = Math.max(0, note.images.length - current.images.length)
      const newPendingCount = Math.max(0, note.pendingImageCount - current.pendingImages.length)
      const failedImageCount = Math.max(
        0,
        noteInput.images.length - newReadyCount - newPendingCount
      )
      return Object.freeze({
        note,
        failedImageCount,
        pendingImageCount: newPendingCount,
        imageMutationFailed: false,
        refreshFailed: false
      })
    } catch {
      return Object.freeze({
        note: null,
        failedImageCount: 0,
        pendingImageCount: 0,
        imageMutationFailed: false,
        refreshFailed: true
      })
    }
  }

  async function removeImages(client, images) {
    if (images.length === 0) return
    const paths = images.map(image => image.objectPath)
    await runQuery(client.storage.from(IMAGE_BUCKET).remove(paths), { storage: true })
    const ids = images.map(image => image.id)
    await runQuery(client.from(IMAGE_TABLE).delete().in('id', ids))
  }

  async function updateNote(noteId, input = {}) {
    const safeNoteId = validateUuid(noteId)
    const keptImageIds = Array.isArray(input.keptImageIds)
      ? input.keptImageIds.map(validateUuid)
      : []
    const newImages = Array.isArray(input.newImages) ? input.newImages : []
    if (
      new Set(keptImageIds).size !== keptImageIds.length ||
      keptImageIds.length + newImages.length > NOTE_LIMITS.imagesPerNote
    ) {
      throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.INVALID_INPUT)
    }
    const noteInput = validateNoteInput({
      title: input.title,
      content: input.content,
      images: newImages
    })
    const { client, userId } = await requireUser()
    const current = mapNote(await getOwnNoteRow(client, safeNoteId))
    const currentIds = new Set(current.images.map(image => image.id))
    if (
      keptImageIds.some(id => !currentIds.has(id)) ||
      keptImageIds.length + current.pendingImages.length + newImages.length > NOTE_LIMITS.imagesPerNote
    ) {
      throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.INVALID_INPUT)
    }
    await runQuery(client.from(NOTE_TABLE).update({
      title: noteInput.title,
      content: noteInput.content
    }).eq('id', safeNoteId))
    try {
      const removedImages = current.images.filter(image => !keptImageIds.includes(image.id))
      await removeImages(client, removedImages)
      const keptImages = current.images.filter(image => keptImageIds.includes(image.id))
      const usedOrders = new Set([
        ...keptImages.map(image => image.sortOrder),
        ...current.pendingImages.map(image => image.sortOrder)
      ])
      const availableOrders = Array.from(
        { length: NOTE_LIMITS.imagesPerNote },
        (_value, index) => index
      ).filter(order => !usedOrders.has(order))
      await uploadImages(
        client,
        userId,
        safeNoteId,
        noteInput.images,
        availableOrders
      )
    } catch {
      return Object.freeze({
        note: null,
        failedImageCount: noteInput.images.length,
        pendingImageCount: current.pendingImages.length,
        imageMutationFailed: true,
        refreshFailed: false
      })
    }
    try {
      const note = await getOwnNote(client, safeNoteId)
      const expectedImageCount = keptImageIds.length + noteInput.images.length
      const newPendingCount = Math.max(0, note.pendingImageCount - current.pendingImages.length)
      const failedImageCount = Math.max(
        0,
        expectedImageCount - note.images.length - newPendingCount
      )
      return Object.freeze({
        note,
        failedImageCount,
        pendingImageCount: newPendingCount,
        imageMutationFailed: false,
        refreshFailed: false
      })
    } catch {
      return Object.freeze({
        note: null,
        failedImageCount: 0,
        pendingImageCount: 0,
        imageMutationFailed: false,
        refreshFailed: true
      })
    }
  }

  async function deleteNote(noteId) {
    const safeNoteId = validateUuid(noteId)
    const { client } = await requireUser()
    await recoverImages(client)
    const current = mapNote(await getOwnNoteRow(client, safeNoteId))
    if (current.pendingImages.length > 0) {
      throw new ParentingNotesRepositoryError(NOTE_ERROR_CODES.STORAGE_ERROR, {
        retryable: true
      })
    }
    await removeImages(client, current.images)
    await runQuery(client.from(NOTE_TABLE).delete().eq('id', safeNoteId))
    return true
  }

  return Object.freeze({
    isAvailable: enabled,
    listOwnNotes,
    createNote,
    updateNote,
    deleteNote
  })
}
