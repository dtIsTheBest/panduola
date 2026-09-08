import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CLICK_BURST_PARTICLE_COUNT,
  MAX_ACTIVE_CLICK_BURSTS,
  createClickBurst
} from '../src/utils/interactionEffects.js'

test('点击烟花生成数量受控且均匀分布的主题粒子', () => {
  const burst = createClickBurst({ id: 'burst-1', x: 120, y: 240 })

  assert.equal(burst.id, 'burst-1')
  assert.equal(burst.x, 120)
  assert.equal(burst.y, 240)
  assert.equal(burst.particles.length, CLICK_BURST_PARTICLE_COUNT)
  assert.equal(new Set(burst.particles.map(particle => particle.id)).size, CLICK_BURST_PARTICLE_COUNT)
  assert.equal(burst.particles[0].angle, '0deg')
  assert.equal(burst.particles.at(-1).angle, '324deg')
  assert.equal(MAX_ACTIVE_CLICK_BURSTS, 3)
})

test('点击烟花拒绝非法坐标、ID 和粒子数量', () => {
  assert.throws(() => createClickBurst({ id: '', x: 1, y: 1 }), /ID 和坐标无效/)
  assert.throws(() => createClickBurst({ id: 'a', x: Number.NaN, y: 1 }), /ID 和坐标无效/)
  assert.throws(() => createClickBurst({ id: 'a', x: 1, y: 1, particleCount: 3 }), /4—16/)
  assert.throws(() => createClickBurst({ id: 'a', x: 1, y: 1, particleCount: 17 }), /4—16/)
})
