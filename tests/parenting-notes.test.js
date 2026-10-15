import test from 'node:test'
import assert from 'node:assert/strict'
import { createNoteExcerpt, parseNoteContent } from '../src/notes/noteContent.js'
import {
  createParentingNotesRepository,
  NOTE_ERROR_CODES
} from '../src/notes/parentingNotesRepository.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const NOTE_ID = '22222222-2222-4222-8222-222222222222'
const IMAGE_ID = '33333333-3333-4333-8333-333333333333'
const SECOND_IMAGE_ID = '44444444-4444-4444-8444-444444444444'
const NEW_IMAGE_ID = '55555555-5555-4555-8555-555555555555'

function createQuery(result) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => query,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }
  return query
}

function createClient({ rows = [], sessionUserId = USER_ID } = {}) {
  return {
    auth: {
      getSession: async () => ({
        data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
        error: null
      })
    },
    rpc: async () => ({ data: null, error: null }),
    from: () => createQuery({ data: rows, error: null }),
    storage: {
      from: () => ({
        createSignedUrls: async paths => ({
          data: paths.map(path => ({
            path,
            signedUrl: `https://storage.example.com/${path}?token=signed`
          })),
          error: null
        })
      })
    }
  }
}

function createOperationQuery(table, operations, resolveResult) {
  const state = { table, action: '', value: null, filters: [] }
  const query = {
    select: value => {
      state.action ||= 'select'
      state.select = value
      return query
    },
    insert: value => {
      state.action = 'insert'
      state.value = value
      operations.push({ table, action: 'insert', value })
      return query
    },
    upsert: value => {
      state.action = 'upsert'
      state.value = value
      operations.push({ table, action: 'upsert', value })
      return query
    },
    update: value => {
      state.action = 'update'
      state.value = value
      operations.push({ table, action: 'update', value })
      return query
    },
    delete: () => {
      state.action = 'delete'
      operations.push({ table, action: 'delete' })
      return query
    },
    eq: (column, value) => {
      state.filters.push({ column, value })
      return query
    },
    in: (column, value) => {
      state.filters.push({ column, value })
      return query
    },
    order: () => query,
    limit: () => query,
    maybeSingle: () => {
      state.single = true
      return query
    },
    then: (resolve, reject) => Promise.resolve(resolveResult(state)).then(resolve, reject)
  }
  return query
}

test('手记正文解析安全 Markdown 链接、裸链接与尾部标点', () => {
  const content = [
    '参考 [官方指南](https://example.com/guide) 和 https://example.com/help。',
    '<img src=x onerror=alert(1)> [危险链接](javascript:alert(1))'
  ].join('\n')
  const lines = parseNoteContent(content)
  const links = lines.flatMap(line => line.tokens).filter(token => token.type === 'link')

  assert.deepEqual(links, [
    { type: 'link', label: '官方指南', href: 'https://example.com/guide' },
    { type: 'link', label: 'https://example.com/help', href: 'https://example.com/help' }
  ])
  const renderedText = lines.flatMap(line => line.tokens)
    .map(token => token.value ?? token.label)
    .join('')
  assert.match(renderedText, /<img/)
  assert.match(renderedText, /javascript/)
})

test('手记摘要限制字符和行数且保留明确省略标记', () => {
  const content = Array.from({ length: 20 }, (_value, index) => `第 ${index + 1} 行`).join('\n')
  const excerpt = createNoteExcerpt(content, { maximumCharacters: 40, maximumLines: 4 })

  assert.equal(excerpt.endsWith('…'), true)
  assert.equal(excerpt.split('\n').length <= 4, true)
  assert.equal(Array.from(excerpt).length <= 41, true)
})

test('未配置与未登录时在访问远端前返回稳定错误', async () => {
  const disabled = createParentingNotesRepository({
    clientProvider: { getClient: async () => createClient() },
    enabled: false,
    randomUUID: () => NOTE_ID
  })
  await assert.rejects(disabled.listOwnNotes(), error => (
    error.code === NOTE_ERROR_CODES.NOT_CONFIGURED
  ))

  const signedOut = createParentingNotesRepository({
    clientProvider: { getClient: async () => createClient({ sessionUserId: null }) },
    randomUUID: () => NOTE_ID
  })
  await assert.rejects(signedOut.listOwnNotes(), error => (
    error.code === NOTE_ERROR_CODES.UNAUTHORIZED
  ))
})

test('非法标题与超长正文会在获取客户端前拒绝', async () => {
  let clientCalls = 0
  const repository = createParentingNotesRepository({
    clientProvider: {
      getClient: async () => {
        clientCalls += 1
        return createClient()
      }
    },
    randomUUID: () => NOTE_ID
  })

  await assert.rejects(repository.createNote({ title: ' ', content: '正文' }), error => (
    error.code === NOTE_ERROR_CODES.INVALID_INPUT
  ))
  await assert.rejects(repository.createNote({ title: '标题', content: '字'.repeat(5001) }), error => (
    error.code === NOTE_ERROR_CODES.INVALID_INPUT
  ))
  assert.equal(clientCalls, 0)
})

test('私有手记列表批量签名图片且不暴露对象路径', async () => {
  const objectPath = `${USER_ID}/${NOTE_ID}/${IMAGE_ID}.webp`
  const rows = [{
    id: NOTE_ID,
    title: '辅食记录',
    content: '今天尝试了南瓜。',
    created_at: '2026-10-15T08:00:00.000Z',
    updated_at: '2026-10-15T08:00:00.000Z',
    parenting_note_images: [{
      id: IMAGE_ID,
      object_path: objectPath,
      mime_type: 'image/webp',
      width: 1200,
      height: 900,
      byte_size: 1024,
      sort_order: 0,
      created_at: '2026-10-15T08:00:00.000Z',
      status: 'ready'
    }]
  }]
  const repository = createParentingNotesRepository({
    clientProvider: { getClient: async () => createClient({ rows }) },
    randomUUID: () => NOTE_ID
  })

  const notes = await repository.listOwnNotes()
  assert.equal(notes.length, 1)
  assert.equal(notes[0].images[0].signedUrl.includes('token='), true)
  assert.equal('objectPath' in notes[0].images[0], false)
})

test('上传结果不确定时保留 pending 元数据并通过恢复流程核对', async () => {
  const operations = []
  const noteRow = {
    id: NOTE_ID,
    title: '保留文字',
    content: '图片失败时文字仍然安全。',
    created_at: '2026-10-15T08:00:00.000Z',
    updated_at: '2026-10-15T08:00:00.000Z',
    parenting_note_images: []
  }
  const client = {
    auth: createClient().auth,
    rpc: async name => {
      operations.push({ action: 'rpc', name })
      return { data: null, error: null }
    },
    from: table => createOperationQuery(table, operations, state => ({
      data: state.single ? noteRow : null,
      error: null
    })),
    storage: {
      from: () => ({
        upload: async () => {
          operations.push({ action: 'upload' })
          throw new TypeError('network interrupted')
        }
      })
    }
  }
  const ids = [NOTE_ID, IMAGE_ID]
  const repository = createParentingNotesRepository({
    clientProvider: { getClient: async () => client },
    randomUUID: () => ids.shift()
  })
  const image = {
    file: new Blob([new Uint8Array(64)], { type: 'image/webp' }),
    width: 100,
    height: 100
  }

  const result = await repository.createNote({
    title: '保留文字',
    content: '图片失败时文字仍然安全。',
    images: [image]
  })

  assert.equal(result.failedImageCount, 1)
  assert.equal(operations.some(item => item.table === 'parenting_note_images' && item.action === 'delete'), false)
  assert.equal(operations.some(item => item.name === 'recover_own_parenting_note_images'), true)
})

test('删除手记严格先删除 Storage 对象再删除图片元数据和正文', async () => {
  const operations = []
  const objectPath = `${USER_ID}/${NOTE_ID}/${IMAGE_ID}.webp`
  const noteRow = {
    id: NOTE_ID,
    title: '待删除手记',
    content: '需要一并清理图片。',
    created_at: '2026-10-15T08:00:00.000Z',
    updated_at: '2026-10-15T08:00:00.000Z',
    parenting_note_images: [{
      id: IMAGE_ID,
      object_path: objectPath,
      mime_type: 'image/webp',
      width: 100,
      height: 100,
      byte_size: 64,
      sort_order: 0,
      created_at: '2026-10-15T08:00:00.000Z',
      status: 'ready'
    }]
  }
  const client = {
    auth: createClient().auth,
    rpc: async () => ({ data: null, error: null }),
    from: table => createOperationQuery(table, operations, state => ({
      data: state.single ? noteRow : null,
      error: null
    })),
    storage: {
      from: () => ({
        remove: async paths => {
          operations.push({ action: 'storage-remove', paths })
          return { data: paths, error: null }
        }
      })
    }
  }
  const repository = createParentingNotesRepository({
    clientProvider: { getClient: async () => client },
    randomUUID: () => NOTE_ID
  })

  await repository.deleteNote(NOTE_ID)

  const storageIndex = operations.findIndex(item => item.action === 'storage-remove')
  const imageDeleteIndex = operations.findIndex(item => (
    item.table === 'parenting_note_images' && item.action === 'delete'
  ))
  const noteDeleteIndex = operations.findIndex(item => (
    item.table === 'parenting_notes' && item.action === 'delete'
  ))
  assert.equal(storageIndex >= 0, true)
  assert.equal(storageIndex < imageDeleteIndex, true)
  assert.equal(imageDeleteIndex < noteDeleteIndex, true)
})

test('存在结果未确认的 pending 图片时暂缓删除手记以保留清理路径', async () => {
  const operations = []
  const pendingPath = `${USER_ID}/${NOTE_ID}/${IMAGE_ID}.webp`
  const pendingRow = {
    id: NOTE_ID,
    title: '等待图片确认',
    content: '删除前需要确认图片最终状态。',
    created_at: '2026-10-15T08:00:00.000Z',
    updated_at: '2026-10-15T08:00:00.000Z',
    parenting_note_images: [{
      id: IMAGE_ID,
      object_path: pendingPath,
      mime_type: 'image/webp',
      width: 100,
      height: 100,
      byte_size: 64,
      sort_order: 0,
      created_at: '2026-10-15T08:00:00.000Z',
      status: 'pending'
    }]
  }
  const client = {
    auth: createClient().auth,
    rpc: async () => ({ data: null, error: null }),
    from: table => createOperationQuery(table, operations, state => ({
      data: state.single ? pendingRow : null,
      error: null
    })),
    storage: {
      from: () => ({
        remove: async () => {
          operations.push({ action: 'storage-remove' })
          return { data: [], error: null }
        }
      })
    }
  }
  const repository = createParentingNotesRepository({
    clientProvider: { getClient: async () => client },
    randomUUID: () => NOTE_ID
  })

  await assert.rejects(repository.deleteNote(NOTE_ID), error => (
    error.code === NOTE_ERROR_CODES.STORAGE_ERROR && error.retryable === true
  ))
  assert.equal(operations.some(item => item.action === 'storage-remove'), false)
  assert.equal(operations.some(item => item.table === 'parenting_notes' && item.action === 'delete'), false)
})

test('创建提交后的回读失败返回已提交状态且稳定 ID 重试使用 upsert', async () => {
  const operations = []
  const client = {
    auth: createClient().auth,
    rpc: async () => ({ data: null, error: null }),
    from: table => createOperationQuery(table, operations, state => {
      if (table === 'parenting_notes' && state.single) {
        return { data: null, error: { status: 503, message: 'readback unavailable' } }
      }
      return { data: null, error: null }
    }),
    storage: { from: () => ({}) }
  }
  const repository = createParentingNotesRepository({
    clientProvider: { getClient: async () => client },
    randomUUID: () => NOTE_ID
  })
  const input = {
    id: NOTE_ID,
    title: '稳定创建',
    content: '回读失败也不重复新增。'
  }

  const first = await repository.createNote(input)
  const retry = await repository.createNote(input)

  assert.equal(first.refreshFailed, true)
  assert.equal(retry.refreshFailed, true)
  const upserts = operations.filter(item => item.table === 'parenting_notes' && item.action === 'upsert')
  assert.equal(upserts.length, 2)
  assert.deepEqual(upserts.map(item => item.value.id), [NOTE_ID, NOTE_ID])
})

test('更新手记保留指定图片、Storage-first 删除旧图并上传新图', async () => {
  const operations = []
  let noteReadCount = 0
  const firstPath = `${USER_ID}/${NOTE_ID}/${IMAGE_ID}.webp`
  const secondPath = `${USER_ID}/${NOTE_ID}/${SECOND_IMAGE_ID}.webp`
  const newPath = `${USER_ID}/${NOTE_ID}/${NEW_IMAGE_ID}.webp`
  const makeImageRow = (id, objectPath, sortOrder) => ({
    id,
    object_path: objectPath,
    mime_type: 'image/webp',
    width: 100,
    height: 100,
    byte_size: 64,
    sort_order: sortOrder,
    created_at: '2026-10-15T08:00:00.000Z',
    status: 'ready'
  })
  const currentRow = {
    id: NOTE_ID,
    title: '更新前',
    content: '旧正文',
    created_at: '2026-10-15T08:00:00.000Z',
    updated_at: '2026-10-15T08:00:00.000Z',
    parenting_note_images: [
      makeImageRow(IMAGE_ID, firstPath, 0),
      makeImageRow(SECOND_IMAGE_ID, secondPath, 1)
    ]
  }
  const finalRow = {
    ...currentRow,
    title: '更新后',
    content: '新正文',
    updated_at: '2026-10-15T09:00:00.000Z',
    parenting_note_images: [
      makeImageRow(IMAGE_ID, firstPath, 0),
      makeImageRow(NEW_IMAGE_ID, newPath, 1)
    ]
  }
  const client = {
    auth: createClient().auth,
    rpc: async () => ({ data: null, error: null }),
    from: table => createOperationQuery(table, operations, state => {
      if (table === 'parenting_notes' && state.single) {
        noteReadCount += 1
        return { data: noteReadCount === 1 ? currentRow : finalRow, error: null }
      }
      return { data: null, error: null }
    }),
    storage: {
      from: () => ({
        remove: async paths => {
          operations.push({ action: 'storage-remove', paths })
          return { data: paths, error: null }
        },
        upload: async path => {
          operations.push({ action: 'upload', path })
          return { data: { path }, error: null }
        },
        createSignedUrls: async paths => ({
          data: paths.map(path => ({
            path,
            signedUrl: `https://storage.example.com/${path}?token=signed`
          })),
          error: null
        })
      })
    }
  }
  const repository = createParentingNotesRepository({
    clientProvider: { getClient: async () => client },
    randomUUID: () => NEW_IMAGE_ID
  })
  const newImage = {
    file: new Blob([new Uint8Array(64)], { type: 'image/webp' }),
    width: 100,
    height: 100
  }

  const result = await repository.updateNote(NOTE_ID, {
    title: '更新后',
    content: '新正文',
    keptImageIds: [IMAGE_ID],
    newImages: [newImage]
  })

  assert.equal(result.refreshFailed, false)
  assert.equal(result.failedImageCount, 0)
  assert.deepEqual(result.note.images.map(image => image.id), [IMAGE_ID, NEW_IMAGE_ID])
  const removeIndex = operations.findIndex(item => item.action === 'storage-remove')
  const metadataDeleteIndex = operations.findIndex(item => (
    item.table === 'parenting_note_images' && item.action === 'delete'
  ))
  const uploadIndex = operations.findIndex(item => item.action === 'upload')
  const finalizeIndex = operations.findIndex(item => (
    item.table === 'parenting_note_images' && item.action === 'update'
  ))
  assert.equal(removeIndex < metadataDeleteIndex, true)
  assert.equal(metadataDeleteIndex < uploadIndex, true)
  assert.equal(uploadIndex < finalizeIndex, true)
})
