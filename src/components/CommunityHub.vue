<template>
  <section class="community-hub" aria-labelledby="community-hub-title">
    <div class="community-heading">
      <div>
        <span class="community-eyebrow">家庭共创空间</span>
        <h2 id="community-hub-title">留下建议，也珍藏只属于你的瞬间</h2>
        <p class="community-note">
          <span>留言公开可见</span>
          <span class="community-note-separator" aria-hidden="true">·</span>
          <span>照片仅存于你的私密账号空间</span>
        </p>
      </div>
    </div>

    <div class="community-grid">
      <FamilyPhotoWall
        :repository="communityRepository"
        :is-signed-in="isSignedIn"
        :user-id="userId"
        @account-request="$emit('account-request', $event)"
      />
      <CommentWall
        :repository="communityRepository"
        :is-signed-in="isSignedIn"
        :user-id="userId"
        :email="email"
        @account-request="$emit('account-request', $event)"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, inject } from 'vue'
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
const email = computed(() => accountSyncFacade?.accountState?.session?.email ?? '')
</script>

<style scoped>
.community-hub {
  margin-top: 1rem;
}

.community-heading {
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

.community-note {
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
  align-items: center;
  margin: 0.5rem 0 0;
  font-size: 0.86rem;
  font-weight: 560;
  line-height: 1.6;
  color: var(--text-secondary);
  letter-spacing: 0.025em;
}

.community-note-separator {
  color: var(--primary-color);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1;
}

.community-grid {
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
  .community-note {
    gap: 0.28rem;
    font-size: 0.82rem;
  }
}
</style>
