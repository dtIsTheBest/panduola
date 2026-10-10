import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createCommentNicknamePreference,
  maskEmailForNickname,
  normalizeCommentNickname
} from '../src/community/commentNickname.js'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

class MemoryStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.get(key) ?? null
  }

  setItem(key, value) {
    this.values.set(key, value)
  }

  removeItem(key) {
    this.values.delete(key)
  }
}

test('邮箱默认昵称脱敏且不超过二十个 Unicode 字符', () => {
  assert.equal(maskEmailForNickname('736437714@qq.com'), '7***4@qq.com')
  assert.equal(maskEmailForNickname('a@example.com'), 'a***@example.com')
  assert.equal(
    maskEmailForNickname('very-long-account@very-long-domain.example'),
    'v***t@v***'
  )
  assert.equal(maskEmailForNickname('invalid-email'), '成长伙伴')
  assert.ok(Array.from(maskEmailForNickname('x@domain.example')).length <= 20)
})

test('自定义昵称按账号隔离、复用并可恢复默认值', () => {
  const storage = new MemoryStorage()
  const preference = createCommentNicknamePreference({ storage })

  assert.equal(preference.read(USER_A, 'alpha@example.com'), 'a***a@example.com')
  assert.equal(preference.write(USER_A, ' 小满妈妈 '), '小满妈妈')
  assert.equal(preference.read(USER_A, 'alpha@example.com'), '小满妈妈')
  assert.equal(preference.read(USER_B, 'beta@example.com'), 'b***a@example.com')

  assert.equal(preference.reset(USER_A), true)
  assert.equal(preference.read(USER_A, 'alpha@example.com'), 'a***a@example.com')
})

test('非法账号、空白和超长昵称不会污染偏好存储', () => {
  const storage = new MemoryStorage()
  const preference = createCommentNicknamePreference({ storage })

  assert.equal(normalizeCommentNickname('\t\n'), null)
  assert.equal(normalizeCommentNickname('昵'.repeat(21)), null)
  assert.equal(preference.write('not-a-user', '昵称'), false)
  assert.equal(preference.write(USER_A, '昵'.repeat(21)), false)
  assert.equal(storage.values.size, 0)
})

test('本地存储异常时安全降级为邮箱脱敏昵称', () => {
  const storage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') }
  }
  const preference = createCommentNicknamePreference({ storage })

  assert.equal(preference.read(USER_A, 'alpha@example.com'), 'a***a@example.com')
  assert.equal(preference.write(USER_A, '昵称'), false)
  assert.equal(preference.reset(USER_A), false)

  const unavailable = createCommentNicknamePreference({ storage: null })
  assert.equal(unavailable.write(USER_A, '昵称'), false)
  assert.equal(unavailable.reset(USER_A), false)
})
