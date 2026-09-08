export const CLICK_BURST_DURATION_MS = 720
export const CLICK_BURST_PARTICLE_COUNT = 10
export const MAX_ACTIVE_CLICK_BURSTS = 3

const PARTICLE_COLORS = [
  'var(--primary-color)',
  'var(--accent-color)',
  'var(--warm-color)',
  'var(--primary-light)'
]

export function createClickBurst({ id, x, y, particleCount = CLICK_BURST_PARTICLE_COUNT }) {
  if (typeof id !== 'string' || !id || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('点击特效的 ID 和坐标无效')
  }
  if (!Number.isInteger(particleCount) || particleCount < 4 || particleCount > 16) {
    throw new TypeError('点击特效粒子数量必须是 4—16 之间的整数')
  }

  const angleStep = 360 / particleCount
  const particles = Array.from({ length: particleCount }, (_, index) => ({
    id: `${id}-particle-${index}`,
    angle: `${angleStep * index}deg`,
    distance: `${24 + (index % 3) * 8}px`,
    delay: `${(index % 2) * 20}ms`,
    size: `${3 + (index % 3)}px`,
    color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
    shape: index % 3 === 0 ? 'diamond' : 'round'
  }))

  return { id, x, y, particles }
}
