import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COMMUNITY_ERROR_CODES,
  createCommunityRepository
} from '../src/community/communityRepository.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const COMMENT_ID = '22222222-2222-4222-8222-222222222222'
const PHOTO_ID = '33333333-3333-4333-8333-333333333333'
const OBJECT_ID = '44444444-4444-4444-8444-444444444444'
const CREATED_AT = '2026-10-10T08:00:00.000Z'
const OBJECT_PATH = `${USER_ID}/${OBJECT_ID}.webp`
const SIGNED_URL = `https://project.supabase.co/storage/v1/object/sign/${OBJECT_PATH}?token=signed-token`

function createCommentRow(overrides = {}) {
  return {
    id: COMMENT_ID,
    nickname: '一位家长',
    content: '希望增加夜间模式。',
    created_at: CREATED_AT,
    can_delete: true,
    user_id: USER_ID,
    email: 'private@example.test',
    ...overrides
  }
}

function createPhotoRow(overrides = {}) {
  return {
    id: PHOTO_ID,
    object_path: OBJECT_PATH,
    caption: '周末公园',
    mime_type: 'image/webp',
    width: 1280,
    height: 960,
    byte_size: 2048,
    created_at: CREATED_AT,
    ...overrides
  }
}

function createFixture({
  session = { user: { id: USER_ID } },
  rpcHandler = async () => ({ data: [], error: null }),
  storageHandler = {}
} = {}) {
  const calls = []
  const client = {
    auth: {
      async getSession() {
        calls.push(['getSession'])
        return { data: { session }, error: null }
      }
    },
    async rpc(name, params) {
      calls.push(['rpc', name, params])
      return rpcHandler(name, params)
    },
    storage: {
      from(bucket) {
        calls.push(['storage.from', bucket])
        return {
          async createSignedUrls(paths, expiresIn) {
            calls.push(['createSignedUrls', paths, expiresIn])
            if (storageHandler.createSignedUrls) {
              return storageHandler.createSignedUrls(paths, expiresIn)
            }
            return {
              data: paths.map(path => ({ path, signedUrl: SIGNED_URL })),
              error: null
            }
          },
          async createSignedUrl(path, expiresIn) {
            calls.push(['createSignedUrl', path, expiresIn])
            if (storageHandler.createSignedUrl) {
              return storageHandler.createSignedUrl(path, expiresIn)
            }
            return { data: { signedUrl: SIGNED_URL }, error: null }
          },
          async upload(path, file, options) {
            calls.push(['upload', path, file, options])
            if (storageHandler.upload) return storageHandler.upload(path, file, options)
            return { data: { path }, error: null }
          },
          async remove(paths) {
            calls.push(['remove', paths])
            if (storageHandler.remove) return storageHandler.remove(paths)
            return { data: paths.map(name => ({ name })), error: null }
          }
        }
      }
    }
  }
  let providerCalls = 0
  const repository = createCommunityRepository({
    clientProvider: {
      async getClient() {
        providerCalls += 1
        return client
      }
    },
    randomUUID: () => OBJECT_ID
  })
  return {
    calls,
    client,
    repository,
    get providerCalls() {
      return providerCalls
    }
  }
}

test('公开评论 DTO 隐藏用户标识和邮箱并保持 Unicode 内容', async () => {
  const fixture = createFixture({
    rpcHandler: async name => {
      assert.equal(name, 'list_community_comments')
      return { data: [createCommentRow({ content: '宝宝喜欢绘本 👶📚' })], error: null }
    }
  })

  const comments = await fixture.repository.listComments()

  assert.deepEqual(comments, [{
    id: COMMENT_ID,
    nickname: '一位家长',
    content: '宝宝喜欢绘本 👶📚',
    createdAt: CREATED_AT,
    canDelete: true
  }])
  assert.equal('userId' in comments[0], false)
  assert.equal('email' in comments[0], false)
  assert.deepEqual(fixture.calls[0], [
    'rpc',
    'list_community_comments',
    { p_limit: 50 }
  ])
})

test('评论输入边界在 Supabase 调用前拒绝并规范化合法文本', async () => {
  const fixture = createFixture({
    rpcHandler: async (name, params) => {
      assert.equal(name, 'create_community_comment')
      assert.deepEqual(params, {
        p_nickname: '家长',
        p_content: '建议增加成长提醒'
      })
      return { data: [createCommentRow()], error: null }
    }
  })

  await assert.rejects(
    fixture.repository.createComment({ nickname: '\n\t', content: '内容' }),
    error => error.code === COMMUNITY_ERROR_CODES.INVALID_INPUT
  )
  await assert.rejects(
    fixture.repository.createComment({ nickname: '家长', content: '育'.repeat(301) }),
    error => error.code === COMMUNITY_ERROR_CODES.INVALID_INPUT
  )
  assert.equal(fixture.providerCalls, 0)

  await fixture.repository.createComment({
    nickname: ' 家长 ',
    content: ' 建议增加成长提醒 '
  })
  assert.equal(fixture.providerCalls, 1)
})

test('异常服务端评论与照片 DTO 映射为可重试远端错误', async () => {
  const invalidComment = createFixture({
    rpcHandler: async () => ({
      data: [createCommentRow({ id: 'not-a-uuid' })],
      error: null
    })
  })
  await assert.rejects(
    invalidComment.repository.listComments(),
    error => (
      error.code === COMMUNITY_ERROR_CODES.NETWORK_ERROR &&
      error.retryable === true
    )
  )

  const invalidPhoto = createFixture({
    rpcHandler: async () => ({
      data: [createPhotoRow({ caption: '字'.repeat(81) })],
      error: null
    })
  })
  await assert.rejects(
    invalidPhoto.repository.listOwnPhotos(),
    error => (
      error.code === COMMUNITY_ERROR_CODES.NETWORK_ERROR &&
      error.retryable === true
    )
  )
})

test('未登录照片请求在 RPC 与 Storage 调用前拒绝', async () => {
  const fixture = createFixture({ session: null })

  await assert.rejects(
    fixture.repository.listOwnPhotos(),
    error => error.code === COMMUNITY_ERROR_CODES.UNAUTHORIZED
  )

  assert.deepEqual(fixture.calls, [['getSession']])
})

test('私有照片列表使用一次批量签名且 DTO 不暴露对象路径', async () => {
  const fixture = createFixture({
    rpcHandler: async name => {
      assert.equal(name, 'list_own_family_photos')
      return { data: [createPhotoRow()], error: null }
    }
  })

  const photos = await fixture.repository.listOwnPhotos()

  assert.deepEqual(photos, [{
    id: PHOTO_ID,
    caption: '周末公园',
    mimeType: 'image/webp',
    width: 1280,
    height: 960,
    byteSize: 2048,
    createdAt: CREATED_AT,
    signedUrl: SIGNED_URL
  }])
  assert.equal('objectPath' in photos[0], false)
  assert.equal(fixture.calls.filter(call => call[0] === 'createSignedUrls').length, 1)
  assert.deepEqual(
    fixture.calls.find(call => call[0] === 'createSignedUrls'),
    ['createSignedUrls', [OBJECT_PATH], 3600]
  )
})

test('照片上传按 reserve、Storage、finalize、签名顺序且禁止 upsert', async () => {
  const orderedCalls = []
  const fixture = createFixture({
    rpcHandler: async (name, params) => {
      orderedCalls.push(name)
      if (name === 'reserve_own_family_photo') {
        assert.equal(params.p_object_path, OBJECT_PATH)
        return { data: [{ allowed: true, ...createPhotoRow() }], error: null }
      }
      assert.equal(name, 'finalize_own_family_photo')
      return { data: [createPhotoRow()], error: null }
    },
    storageHandler: {
      async upload(path, _file, options) {
        orderedCalls.push('storage.upload')
        assert.equal(path, OBJECT_PATH)
        assert.deepEqual(options, {
          contentType: 'image/webp',
          cacheControl: '3600',
          upsert: false
        })
        return { data: { path }, error: null }
      },
      async createSignedUrl() {
        orderedCalls.push('storage.sign')
        return { data: { signedUrl: SIGNED_URL }, error: null }
      }
    }
  })
  const file = new Blob([new Uint8Array(2048)], { type: 'image/webp' })

  const photo = await fixture.repository.uploadOwnPhoto({
    file,
    caption: ' 周末公园 ',
    width: 1280,
    height: 960
  })

  assert.equal(photo.signedUrl, SIGNED_URL)
  assert.deepEqual(orderedCalls, [
    'reserve_own_family_photo',
    'storage.upload',
    'finalize_own_family_photo',
    'storage.sign'
  ])
})

test('明确上传失败取消预留，网络结果不确定时保留服务端恢复状态', async () => {
  const definiteCalls = []
  const definite = createFixture({
    rpcHandler: async name => {
      definiteCalls.push(name)
      if (name === 'reserve_own_family_photo') {
        return { data: [{ allowed: true, ...createPhotoRow() }], error: null }
      }
      assert.equal(name, 'cancel_own_family_photo')
      return { data: [{ deleted: true, object_path: OBJECT_PATH }], error: null }
    },
    storageHandler: {
      upload: async () => ({ data: null, error: { status: 503, message: 'unavailable' } })
    }
  })
  const file = new Blob([new Uint8Array(32)], { type: 'image/webp' })

  await assert.rejects(
    definite.repository.uploadOwnPhoto({ file, width: 20, height: 20 }),
    error => error.code === COMMUNITY_ERROR_CODES.STORAGE_ERROR
  )
  assert.deepEqual(definiteCalls, [
    'reserve_own_family_photo',
    'cancel_own_family_photo'
  ])

  const uncertainCalls = []
  const uncertain = createFixture({
    rpcHandler: async name => {
      uncertainCalls.push(name)
      return { data: [{ allowed: true, ...createPhotoRow() }], error: null }
    },
    storageHandler: {
      upload: async () => { throw new TypeError('fetch failed') }
    }
  })
  await assert.rejects(
    uncertain.repository.uploadOwnPhoto({ file, width: 20, height: 20 }),
    error => error.code === COMMUNITY_ERROR_CODES.STORAGE_ERROR
  )
  assert.deepEqual(uncertainCalls, ['reserve_own_family_photo'])
})

test('上传失败时取消预留会检查返回错误并进行一次幂等重试', async () => {
  let cancelCalls = 0
  const fixture = createFixture({
    rpcHandler: async name => {
      if (name === 'reserve_own_family_photo') {
        return { data: [{ allowed: true, ...createPhotoRow() }], error: null }
      }
      assert.equal(name, 'cancel_own_family_photo')
      cancelCalls += 1
      return { data: null, error: { status: 503, message: 'cancel unavailable' } }
    },
    storageHandler: {
      upload: async () => ({ data: null, error: { status: 503, message: 'upload unavailable' } })
    }
  })
  const file = new Blob([new Uint8Array(32)], { type: 'image/webp' })

  await assert.rejects(
    fixture.repository.uploadOwnPhoto({ file, width: 20, height: 20 }),
    error => (
      error.code === COMMUNITY_ERROR_CODES.STORAGE_ERROR &&
      error.retryable === true &&
      error.cause instanceof AggregateError
    )
  )
  assert.equal(cancelCalls, 2)
})

test('照片删除严格先移除 Storage 对象再清理本人元数据', async () => {
  const order = []
  const fixture = createFixture({
    rpcHandler: async name => {
      if (name === 'list_own_family_photos') {
        return { data: [createPhotoRow()], error: null }
      }
      order.push(name)
      return { data: [{ deleted: true, object_path: OBJECT_PATH }], error: null }
    },
    storageHandler: {
      async remove(paths) {
        order.push('storage.remove')
        assert.deepEqual(paths, [OBJECT_PATH])
        return { data: [{ name: OBJECT_PATH }], error: null }
      }
    }
  })
  await fixture.repository.listOwnPhotos()

  assert.equal(await fixture.repository.deleteOwnPhoto(PHOTO_ID), true)
  assert.deepEqual(order, ['storage.remove', 'delete_own_family_photo'])
})

test('关闭配置、数量上限和非法签名地址映射为稳定错误', async () => {
  let providerCalls = 0
  const disabled = createCommunityRepository({
    enabled: false,
    clientProvider: {
      async getClient() {
        providerCalls += 1
        return {}
      }
    },
    randomUUID: null
  })
  await assert.rejects(
    disabled.listComments(),
    error => error.code === COMMUNITY_ERROR_CODES.NOT_CONFIGURED
  )
  assert.equal(providerCalls, 0)

  const limit = createFixture({
    rpcHandler: async name => {
      assert.equal(name, 'reserve_own_family_photo')
      return { data: [{ allowed: false }], error: null }
    }
  })
  const file = new Blob([new Uint8Array(32)], { type: 'image/webp' })
  await assert.rejects(
    limit.repository.uploadOwnPhoto({ file, width: 20, height: 20 }),
    error => error.code === COMMUNITY_ERROR_CODES.LIMIT_EXCEEDED
  )

  const unsigned = createFixture({
    rpcHandler: async () => ({ data: [createPhotoRow()], error: null }),
    storageHandler: {
      createSignedUrls: async () => ({
        data: [{ path: OBJECT_PATH, signedUrl: 'https://cdn.example/photo.webp' }],
        error: null
      })
    }
  })
  await assert.rejects(
    unsigned.repository.listOwnPhotos(),
    error => error.code === COMMUNITY_ERROR_CODES.STORAGE_ERROR
  )
})
