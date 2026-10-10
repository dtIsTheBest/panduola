import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculatePhotoDimensions,
  PHOTO_PROCESSING_LIMITS,
  PHOTO_PROCESSOR_ERROR_CODES,
  processPhoto,
  readPhotoDimensions
} from '../src/community/photoProcessor.js'

function createBitmap(width = 4000, height = 3000) {
  let closed = false
  return {
    width,
    height,
    close() {
      closed = true
    },
    get closed() {
      return closed
    }
  }
}

function createCanvasFixture(encodedSizes = [2048]) {
  const drawCalls = []
  const qualities = []
  let encodeIndex = 0
  return {
    drawCalls,
    qualities,
    factory(width, height) {
      return {
        width,
        height,
        getContext(type, options) {
          assert.equal(type, '2d')
          assert.deepEqual(options, { alpha: true })
          return {
            drawImage(...args) {
              drawCalls.push(args)
            }
          }
        },
        async convertToBlob(options) {
          qualities.push(options.quality)
          const size = encodedSizes[Math.min(encodeIndex, encodedSizes.length - 1)]
          encodeIndex += 1
          return new Blob([new Uint8Array(size)], { type: options.type })
        }
      }
    }
  }
}

function readDimensions(width = 4000, height = 3000) {
  return async () => ({ width, height })
}

function setAscii(bytes, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index)
  }
}

function createOrientedJpeg(width, height, orientation) {
  const bytes = new Uint8Array(49)
  const view = new DataView(bytes.buffer)
  bytes.set([0xff, 0xd8, 0xff, 0xe1])
  view.setUint16(4, 34)
  setAscii(bytes, 6, 'Exif')
  setAscii(bytes, 12, 'II')
  view.setUint16(14, 42, true)
  view.setUint32(16, 8, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 0x0112, true)
  view.setUint16(24, 3, true)
  view.setUint32(26, 1, true)
  view.setUint16(30, orientation, true)
  bytes.set([0xff, 0xc0], 38)
  view.setUint16(40, 7)
  bytes[42] = 8
  view.setUint16(43, height)
  view.setUint16(45, width)
  bytes.set([0xff, 0xd9], 47)
  return new Blob([bytes], { type: 'image/jpeg' })
}

test('图片尺寸保持比例且仅在超过 1920 时缩小', () => {
  assert.deepEqual(calculatePhotoDimensions(4000, 3000), {
    width: 1920,
    height: 1440
  })
  assert.deepEqual(calculatePhotoDimensions(800, 1200), {
    width: 800,
    height: 1200
  })
})

test('JPEG PNG WebP 文件头在像素解码前读取尺寸', async () => {
  const png = new Uint8Array(24)
  png.set([137, 80, 78, 71, 13, 10, 26, 10])
  setAscii(png, 12, 'IHDR')
  const pngView = new DataView(png.buffer)
  pngView.setUint32(16, 4000)
  pngView.setUint32(20, 3000)

  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08,
    0x0b, 0xb8, 0x0f, 0xa0, 0xff, 0xd9
  ])

  const webp = new Uint8Array(30)
  setAscii(webp, 0, 'RIFF')
  setAscii(webp, 8, 'WEBP')
  setAscii(webp, 12, 'VP8X')
  const webpView = new DataView(webp.buffer)
  webpView.setUint32(16, 10, true)
  const webpWidth = 3999
  const webpHeight = 2999
  webp[24] = webpWidth & 0xff
  webp[25] = webpWidth >> 8 & 0xff
  webp[26] = webpWidth >> 16 & 0xff
  webp[27] = webpHeight & 0xff
  webp[28] = webpHeight >> 8 & 0xff
  webp[29] = webpHeight >> 16 & 0xff

  for (const [bytes, type] of [
    [jpeg, 'image/jpeg'],
    [png, 'image/png'],
    [webp, 'image/webp']
  ]) {
    const dimensions = await readPhotoDimensions(new Blob([bytes], { type }))
    assert.deepEqual(dimensions, { width: 4000, height: 3000 })
  }
})

test('EXIF Orientation 6 的手机竖拍照片使用视觉宽高缩放', async () => {
  const input = createOrientedJpeg(4000, 3000, 6)
  assert.deepEqual(await readPhotoDimensions(input), {
    width: 3000,
    height: 4000
  })
  const bitmap = createBitmap(1440, 1920)
  const canvas = createCanvasFixture()

  const result = await processPhoto(input, {
    createImageBitmapImpl: async (_file, options) => {
      assert.equal(options.imageOrientation, 'from-image')
      assert.equal(options.resizeWidth, 1440)
      assert.equal(options.resizeHeight, 1920)
      return bitmap
    },
    canvasFactory: canvas.factory
  })

  assert.deepEqual({ width: result.width, height: result.height }, {
    width: 1440,
    height: 1920
  })
})

test('JPEG PNG WebP 允许处理，输出统一为无元数据 WebP', async () => {
  for (const inputType of ['image/jpeg', 'image/png', 'image/webp']) {
    const bitmap = createBitmap()
    const canvas = createCanvasFixture()
    const input = new Blob([new Uint8Array(4096)], { type: inputType })

    const result = await processPhoto(input, {
      createImageBitmapImpl: async () => bitmap,
      canvasFactory: canvas.factory,
      readSourceDimensionsImpl: readDimensions()
    })

    assert.equal(result.mimeType, 'image/webp')
    assert.equal(result.file.type, 'image/webp')
    assert.equal(result.width, 1920)
    assert.equal(result.height, 1440)
    assert.equal(result.byteSize, 2048)
    assert.equal(bitmap.closed, true)
    assert.equal(canvas.drawCalls.length, 1)
    assert.equal(canvas.drawCalls[0][3], 1920)
    assert.equal(canvas.drawCalls[0][4], 1440)
  }
})

test('非法 MIME、空文件与超过 10 MiB 在解码前拒绝', async () => {
  let decodeCalls = 0
  const createImageBitmapImpl = async () => {
    decodeCalls += 1
    return createBitmap()
  }

  await assert.rejects(
    processPhoto(new Blob([new Uint8Array(1)], { type: 'image/gif' }), {
      createImageBitmapImpl
    }),
    error => error.code === PHOTO_PROCESSOR_ERROR_CODES.INVALID_FILE
  )
  await assert.rejects(
    processPhoto(new Blob([], { type: 'image/png' }), { createImageBitmapImpl }),
    error => error.code === PHOTO_PROCESSOR_ERROR_CODES.INVALID_FILE
  )
  const oversized = {
    size: PHOTO_PROCESSING_LIMITS.maximumInputBytes + 1,
    type: 'image/jpeg'
  }
  await assert.rejects(
    processPhoto(oversized, { createImageBitmapImpl }),
    error => error.code === PHOTO_PROCESSOR_ERROR_CODES.FILE_TOO_LARGE
  )
  assert.equal(decodeCalls, 0)
})

test('编码结果过大时逐级降低质量并在成功后立即停止', async () => {
  const bitmap = createBitmap(1920, 1080)
  const canvas = createCanvasFixture([
    PHOTO_PROCESSING_LIMITS.maximumOutputBytes + 100,
    PHOTO_PROCESSING_LIMITS.maximumOutputBytes + 1,
    4096
  ])
  const input = new Blob([new Uint8Array(1024)], { type: 'image/jpeg' })

  const result = await processPhoto(input, {
    createImageBitmapImpl: async () => bitmap,
    canvasFactory: canvas.factory,
    readSourceDimensionsImpl: readDimensions(1920, 1080)
  })

  assert.equal(result.byteSize, 4096)
  assert.deepEqual(canvas.qualities, [0.86, 0.74, 0.62])
  assert.equal(bitmap.closed, true)
})

test('超高像素图片在完整解码前拒绝，常见 48MP 图片按比例解码', async () => {
  let decodeCalls = 0
  const input = new Blob([new Uint8Array(1024)], { type: 'image/jpeg' })

  await assert.rejects(
    processPhoto(input, {
      readSourceDimensionsImpl: readDimensions(20_000, 10_000),
      createImageBitmapImpl: async () => {
        decodeCalls += 1
        return createBitmap()
      }
    }),
    error => error.code === PHOTO_PROCESSOR_ERROR_CODES.DIMENSIONS_TOO_LARGE
  )
  assert.equal(decodeCalls, 0)

  const bitmap = createBitmap(1920, 1440)
  const canvas = createCanvasFixture()
  const result = await processPhoto(input, {
    readSourceDimensionsImpl: readDimensions(8000, 6000),
    createImageBitmapImpl: async (_file, options) => {
      assert.equal(options.resizeWidth, 1920)
      assert.equal(options.resizeHeight, 1440)
      return bitmap
    },
    canvasFactory: canvas.factory
  })
  assert.deepEqual({ width: result.width, height: result.height }, {
    width: 1920,
    height: 1440
  })
})

test('解码、Canvas 和最终输出失败映射稳定错误并关闭位图', async () => {
  const input = new Blob([new Uint8Array(1024)], { type: 'image/jpeg' })
  await assert.rejects(
    processPhoto(input, {
      createImageBitmapImpl: async () => { throw new Error('private decoder error') },
      readSourceDimensionsImpl: readDimensions()
    }),
    error => (
      error.code === PHOTO_PROCESSOR_ERROR_CODES.DECODE_FAILED &&
      !error.message.includes('private')
    )
  )

  const missingContextBitmap = createBitmap()
  await assert.rejects(
    processPhoto(input, {
      createImageBitmapImpl: async () => missingContextBitmap,
      canvasFactory: () => ({ getContext: () => null }),
      readSourceDimensionsImpl: readDimensions()
    }),
    error => error.code === PHOTO_PROCESSOR_ERROR_CODES.UNSUPPORTED_ENVIRONMENT
  )
  assert.equal(missingContextBitmap.closed, true)

  const oversizedBitmap = createBitmap()
  const canvas = createCanvasFixture([
    PHOTO_PROCESSING_LIMITS.maximumOutputBytes + 1
  ])
  await assert.rejects(
    processPhoto(input, {
      createImageBitmapImpl: async () => oversizedBitmap,
      canvasFactory: canvas.factory,
      readSourceDimensionsImpl: readDimensions()
    }),
    error => error.code === PHOTO_PROCESSOR_ERROR_CODES.OUTPUT_TOO_LARGE
  )
  assert.equal(canvas.qualities.length, 4)
  assert.equal(oversizedBitmap.closed, true)

  for (const canvasFactory of [
    () => { throw new DOMException('allocation failed') },
    () => ({
      getContext: () => ({
        drawImage() { throw new DOMException('draw failed') }
      })
    })
  ]) {
    const failedBitmap = createBitmap()
    await assert.rejects(
      processPhoto(input, {
        createImageBitmapImpl: async () => failedBitmap,
        canvasFactory,
        readSourceDimensionsImpl: readDimensions()
      }),
      error => error.code === PHOTO_PROCESSOR_ERROR_CODES.ENCODE_FAILED
    )
    assert.equal(failedBitmap.closed, true)
  }
})
