<template>
  <section class="community-hub" aria-labelledby="community-hub-title">
    <div class="community-heading">
      <div>
        <span class="community-eyebrow">家庭共创空间</span>
        <h2 id="community-hub-title">留下建议，也珍藏只属于你的瞬间</h2>
        <p>留言对所有人可见；亲子照片只保存在你的私密账号空间。</p>
      </div>
      <div class="privacy-badge">
        <ShieldCheck :size="18" />
        <span>照片账号隔离</span>
      </div>
    </div>

    <div class="community-grid">
      <CommentWall
        :repository="communityRepository"
        :is-signed-in="isSignedIn"
        @account-request="$emit('account-request', $event)"
      />
      <FamilyPhotoWall
        :repository="communityRepository"
        :is-signed-in="isSignedIn"
        :user-id="userId"
        @account-request="$emit('account-request', $event)"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, inject } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'
import { ACCOUNT_SYNC_FACADE_KEY } from '@/account/accountSyncFacade'
import { COMMUNITY_REPOSITORY_KEY } from '@/community/communityRepository'
import CommentWall from './CommentWall.vue'
import FamilyPhotoWall from './FamilyPhotoWall.vue'

defineEmits(['account-request'])

const accountSyncFacade = inject(ACCOUNT_SYNC_FACADE_KEY, null)
const communityRepository = inject(COMMUNITY_REPOSITORY_KEY, null)

const userId = computed(() => {
  if (accountSyncFacade?.accountState?.status !== 'signed-in') return null
  return accountSyncFacade.accountState.session?.userId ?? null
})
const isSignedIn = computed(() => Boolean(userId.value))
</script>

<style scoped>
.community-hub {
  position: relative;
  margin-top: 1rem;
  padding: 1.25rem;
  overflow: hidden;
  background: linear-gradient(145deg, var(--card-bg), var(--surface-soft));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-md);
}

.community-hub::before {
  position: absolute;
  top: -90px;
  right: -80px;
  width: 220px;
  height: 220px;
  pointer-events: none;
  content: '';
  background: radial-gradient(circle, rgba(40, 127, 116, 0.13), transparent 68%);
}

.community-heading {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.community-eyebrow {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--primary-color);
  letter-spacing: 0.13em;
}

.community-heading h2 {
  margin: 0;
  font-size: clamp(1.15rem, 2.4vw, 1.55rem);
  color: var(--text-primary);
}

.community-heading p {
  margin: 0.45rem 0 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.privacy-badge {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 0.4rem;
  align-items: center;
  padding: 0.55rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--primary-color);
  white-space: nowrap;
  background: var(--primary-soft);
  border: 1px solid rgba(40, 127, 116, 0.18);
  border-radius: 999px;
}

.community-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.9rem;
  align-items: stretch;
}

@media (max-width: 900px) {
  .community-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .community-hub {
    padding: 0.85rem;
    border-radius: var(--radius-xl);
  }

  .community-heading {
    display: block;
  }

  .privacy-badge {
    margin-top: 0.75rem;
  }
}
</style>
