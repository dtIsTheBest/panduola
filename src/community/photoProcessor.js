export const PHOTO_PROCESSOR_ERROR_CODES = Object.freeze({
  INVALID_FILE: 'PHOTO_INVALID_FILE',
  FILE_TOO_LARGE: 'PHOTO_FILE_TOO_LARGE',
  DIMENSIONS_TOO_LARGE: 'PHOTO_DIMENSIONS_TOO_LARGE',
  DECODE_FAILED: 'PHOTO_DECODE_FAILED',
  ENCODE_FAILED: 'PHOTO_ENCODE_FAILED',
  OUTPUT_TOO_LARGE: 'PHOTO_OUTPUT_TOO_LARGE',
  UNSUPPORTED_ENVIRONMENT: 'PHOTO_UNSUPPORTED_ENVIRONMENT'
})

export const PHOTO_PROCESSING_LIMITS = Object.freeze({
  maximumInputBytes: 10 * 1024 * 1024,
  maximumOutputBytes: 5 * 1024 * 1024,
  maximumDimension: 1920,
  maximumSourcePixels: 150_000_000,
  outputMimeType: 'image/webp'
})

const ACCEPTED_INPUT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
])
const ENCODE_QUALITIES = Object.freeze([0.86, 0.74, 0.62, 0.5])

const ERROR_MESSAGES = Object.freeze({
  PHOTO_INVALID_FILE: '请选择 JPEG、PNG 或 WebP 图片。',
  PHOTO_FILE_TOO_LARGE: '原始图片不能超过 10 MiB。',
  PHOTO_DIMENSIONS_TOO_LARGE: '图片像素过高，请选择分辨率更低的图片。',
  PHOTO_DECODE_FAILED: '图片无法读取，请重新选择。',
  PHOTO_ENCODE_FAILED: '图片处理失败，请重新选择。',
  PHOTO_OUTPUT_TOO_LARGE: '压缩后的图片仍超过 5 MiB，请选择更小的图片。',
  PHOTO_UNSUPPORTED_ENVIRONMENT: '当前浏览器不支持安全图片处理。'
})

export class PhotoProcessorError extends Error {
  constructor(code, options = {}) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.PHOTO_ENCODE_FAILED)
    this.name = 'PhotoProcessorError'
    this.code = code
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

export function calculatePhotoDimensions(
  sourceWidth,
  sourceHeight,
  maximumDimension = PHOTO_PROCESSING_LIMITS.maximumDimension
) {
  if (
    !Number.isFinite(sourceWidth) || sourceWidth <= 0 ||
    !Number.isFinite(sourceHeight) || sourceHeight <= 0 ||
    !Number.isSafeInteger(maximumDimension) || maximumDimension <= 0
  ) {
    throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.DECODE_FAILED)
  }
  const scale = Math.min(1, maximumDimension / Math.max(sourceWidth, sourceHeight))
  return Object.freeze({
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  })
}

function createDefaultCanvas(width, height) {
  if (typeof globalThis.OffscreenCanvas === 'function') {
    return new globalThis.OffscreenCanvas(width, height)
  }
  if (globalThis.document?.createElement) {
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new PhotoProcessorError(
    PHOTO_PROCESSOR_ERROR_CODES.UNSUPPORTED_ENVIRONMENT
  )
}

async function encodeCanvas(canvas, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({
      type: PHOTO_PROCESSING_LIMITS.outputMimeType,
      quality
    })
  }
  if (typeof canvas.toBlob !== 'function') {
    throw new PhotoProcessorError(
      PHOTO_PROCESSOR_ERROR_CODES.UNSUPPORTED_ENVIRONMENT
    )
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.ENCODE_FAILED))
    }, PHOTO_PROCESSING_LIMITS.outputMimeType, quality)
  })
}

function validateInputFile(file) {
  const mimeType = String(file?.type ?? '').toLowerCase()
  if (
    typeof file?.size !== 'number' ||
    file.size <= 0 ||
    !ACCEPTED_INPUT_TYPES.has(mimeType)
  ) {
    throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.INVALID_FILE)
  }
  if (file.size > PHOTO_PROCESSING_LIMITS.maximumInputBytes) {
    throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.FILE_TOO_LARGE)
  }
}

function validateSourceDimensions(width, height) {
  if (
    !Number.isFinite(width) || width <= 0 ||
    !Number.isFinite(height) || height <= 0
  ) {
    throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.DECODE_FAILED)
  }
  if (width * height > PHOTO_PROCESSING_LIMITS.maximumSourcePixels) {
    throw new PhotoProcessorError(
      PHOTO_PROCESSOR_ERROR_CODES.DIMENSIONS_TOO_LARGE
    )
  }
  return Object.freeze({ width, height })
}

function hasAscii(bytes, offset, value) {
  if (offset + value.length > bytes.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

function readExifOrientation(bytes, view, dataOffset, dataLength) {
  let tiffOffset = dataOffset
  const dataEnd = Math.min(bytes.length, dataOffset + dataLength)
  if (
    hasAscii(bytes, dataOffset, 'Exif') &&
    bytes[dataOffset + 4] === 0 &&
    bytes[dataOffset + 5] === 0
  ) {
    tiffOffset += 6
  }
  if (tiffOffset + 8 > dataEnd) return 1
  const byteOrder = String.fromCharCode(bytes[tiffOffset], bytes[tiffOffset + 1])
  if (!['II', 'MM'].includes(byteOrder)) return 1
  const littleEndian = byteOrder === 'II'
  if (view.getUint16(tiffOffset + 2, littleEndian) !== 42) return 1
  const directoryOffset = view.getUint32(tiffOffset + 4, littleEndian)
  const directoryStart = tiffOffset + directoryOffset
  if (directoryStart + 2 > dataEnd) return 1
  const entryCount = view.getUint16(directoryStart, littleEndian)
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = directoryStart + 2 + index * 12
    if (entryOffset + 12 > dataEnd) return 1
    const tag = view.getUint16(entryOffset, littleEndian)
    const type = view.getUint16(entryOffset + 2, littleEndian)
    const count = view.getUint32(entryOffset + 4, littleEndian)
    if (tag !== 0x0112 || type !== 3 || count < 1) continue
    const orientation = view.getUint16(entryOffset + 8, littleEndian)
    return orientation >= 1 && orientation <= 8 ? orientation : 1
  }
  return 1
}

function applyExifOrientation(dimensions, orientation) {
  if (!dimensions) return null
  if (orientation >= 5 && orientation <= 8) {
    return { width: dimensions.height, height: dimensions.width }
  }
  return dimensions
}

function readPngDimensions(bytes, view) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (
    bytes.length < 24 ||
    !signature.every((value, index) => bytes[index] === value) ||
    !hasAscii(bytes, 12, 'IHDR')
  ) {
    return null
  }
  const dimensions = { width: view.getUint32(16), height: view.getUint32(20) }
  let orientation = 1
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const chunkLength = view.getUint32(offset)
    const dataOffset = offset + 8
    if (dataOffset + chunkLength + 4 > bytes.length) break
    if (hasAscii(bytes, offset + 4, 'eXIf')) {
      orientation = readExifOrientation(
        bytes,
        view,
        dataOffset,
        chunkLength
      )
    }
    if (hasAscii(bytes, offset + 4, 'IEND')) break
    offset += 12 + chunkLength
  }
  return applyExifOrientation(dimensions, orientation)
}

function isJpegStartOfFrame(marker) {
  return (
    marker >= 0xc0 && marker <= 0xc3 ||
    marker >= 0xc5 && marker <= 0xc7 ||
    marker >= 0xc9 && marker <= 0xcb ||
    marker >= 0xcd && marker <= 0xcf
  )
}

function readJpegDimensions(bytes, view) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  let dimensions = null
  let orientation = 1
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) {
      continue
    }
    if (marker === 0xd9 || marker === 0xda || offset + 2 > bytes.length) break
    const segmentLength = view.getUint16(offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null
    if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
      dimensions = {
        width: view.getUint16(offset + 5),
        height: view.getUint16(offset + 3)
      }
    }
    if (
      marker === 0xe1 &&
      segmentLength >= 8 &&
      hasAscii(bytes, offset + 2, 'Exif')
    ) {
      orientation = readExifOrientation(
        bytes,
        view,
        offset + 2,
        segmentLength - 2
      )
    }
    offset += segmentLength
  }
  return applyExifOrientation(dimensions, orientation)
}

function readUint24LittleEndian(bytes, offset) {
  return bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16
}

function readWebpChunkDimensions(bytes, view, offset, chunkType) {
  const dataOffset = offset + 8
  if (chunkType === 'VP8X' && dataOffset + 10 <= bytes.length) {
    return {
      width: readUint24LittleEndian(bytes, dataOffset + 4) + 1,
      height: readUint24LittleEndian(bytes, dataOffset + 7) + 1
    }
  }
  if (
    chunkType === 'VP8L' &&
    dataOffset + 5 <= bytes.length &&
    bytes[dataOffset] === 0x2f
  ) {
    const first = bytes[dataOffset + 1]
    const second = bytes[dataOffset + 2]
    const third = bytes[dataOffset + 3]
    const fourth = bytes[dataOffset + 4]
    return {
      width: 1 + first + ((second & 0x3f) << 8),
      height: 1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10)
    }
  }
  if (
    chunkType === 'VP8 ' &&
    dataOffset + 10 <= bytes.length &&
    bytes[dataOffset + 3] === 0x9d &&
    bytes[dataOffset + 4] === 0x01 &&
    bytes[dataOffset + 5] === 0x2a
  ) {
    return {
      width: view.getUint16(dataOffset + 6, true) & 0x3fff,
      height: view.getUint16(dataOffset + 8, true) & 0x3fff
    }
  }
  return null
}

function readWebpDimensions(bytes, view) {
  if (
    bytes.length < 20 ||
    !hasAscii(bytes, 0, 'RIFF') ||
    !hasAscii(bytes, 8, 'WEBP')
  ) {
    return null
  }
  let offset = 12
  let dimensions = null
  let orientation = 1
  while (offset + 8 <= bytes.length) {
    const chunkType = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    const chunkSize = view.getUint32(offset + 4, true)
    if (offset + 8 + chunkSize > bytes.length) break
    dimensions = dimensions ?? readWebpChunkDimensions(
      bytes,
      view,
      offset,
      chunkType
    )
    if (chunkType === 'EXIF') {
      orientation = readExifOrientation(bytes, view, offset + 8, chunkSize)
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }
  return applyExifOrientation(dimensions, orientation)
}

export async function readPhotoDimensions(file) {
  if (typeof file?.arrayBuffer !== 'function') {
    throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.DECODE_FAILED)
  }
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const mimeType = String(file.type).toLowerCase()
  let dimensions = null
  if (mimeType === 'image/png') dimensions = readPngDimensions(bytes, view)
  if (mimeType === 'image/jpeg') dimensions = readJpegDimensions(bytes, view)
  if (mimeType === 'image/webp') dimensions = readWebpDimensions(bytes, view)
  if (!dimensions) {
    throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.DECODE_FAILED)
  }
  return validateSourceDimensions(dimensions.width, dimensions.height)
}

export async function processPhoto(file, {
  createImageBitmapImpl = globalThis.createImageBitmap?.bind(globalThis),
  canvasFactory = createDefaultCanvas,
  readSourceDimensionsImpl = readPhotoDimensions
} = {}) {
  validateInputFile(file)
  if (typeof createImageBitmapImpl !== 'function') {
    throw new PhotoProcessorError(
      PHOTO_PROCESSOR_ERROR_CODES.UNSUPPORTED_ENVIRONMENT
    )
  }

  let bitmap
  try {
    const sourceDimensions = await readSourceDimensionsImpl(file)
    const safeSourceDimensions = validateSourceDimensions(
      sourceDimensions.width,
      sourceDimensions.height
    )
    const resizeDimensions = calculatePhotoDimensions(
      safeSourceDimensions.width,
      safeSourceDimensions.height
    )
    const decodeOptions = {
      imageOrientation: 'from-image',
      resizeWidth: resizeDimensions.width,
      resizeHeight: resizeDimensions.height,
      resizeQuality: 'high'
    }
    bitmap = await createImageBitmapImpl(file, decodeOptions)
  } catch (error) {
    if (error instanceof PhotoProcessorError) throw error
    throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.DECODE_FAILED, {
      cause: error
    })
  }

  try {
    validateSourceDimensions(bitmap.width, bitmap.height)
    const dimensions = calculatePhotoDimensions(bitmap.width, bitmap.height)
    try {
      const canvas = canvasFactory(dimensions.width, dimensions.height)
      const context = canvas?.getContext?.('2d', { alpha: true })
      if (!context) {
        throw new PhotoProcessorError(
          PHOTO_PROCESSOR_ERROR_CODES.UNSUPPORTED_ENVIRONMENT
        )
      }
      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height)

      for (const quality of ENCODE_QUALITIES) {
        const blob = await encodeCanvas(canvas, quality)
        if (
          blob?.type === PHOTO_PROCESSING_LIMITS.outputMimeType &&
          blob.size > 0 &&
          blob.size <= PHOTO_PROCESSING_LIMITS.maximumOutputBytes
        ) {
          return Object.freeze({
            file: blob,
            width: dimensions.width,
            height: dimensions.height,
            byteSize: blob.size,
            mimeType: PHOTO_PROCESSING_LIMITS.outputMimeType
          })
        }
      }
      throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.OUTPUT_TOO_LARGE)
    } catch (error) {
      if (error instanceof PhotoProcessorError) throw error
      throw new PhotoProcessorError(PHOTO_PROCESSOR_ERROR_CODES.ENCODE_FAILED, {
        cause: error
      })
    }
  } finally {
    bitmap?.close?.()
  }
}
