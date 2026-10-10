<template>
  <section class="community-hub" aria-label="家庭共创空间">
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
</style>
