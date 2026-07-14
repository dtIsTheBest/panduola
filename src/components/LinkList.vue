<template>
  <div class="link-list">
    <div class="link-list-header">
      <h2 class="link-list-title">
        <component :is="getIcon(category?.icon || 'Link')" :size="20" />
        {{ category?.name || '全部链接' }}
      </h2>
      <div class="header-actions">
        <button 
          class="btn btn-secondary btn-sm" 
          :class="{ active: showFavoritesOnly }"
          @click="showFavoritesOnly = !showFavoritesOnly"
        >
          <Star :size="14" :fill="showFavoritesOnly ? 'currentColor' : 'none'" /> 
          {{ showFavoritesOnly ? '全部' : '收藏' }}
        </button>
        <button class="btn btn-primary btn-sm" @click="$emit('add-link')">
          <Plus :size="16" /> 添加链接
        </button>
      </div>
    </div>
    
    <div v-if="filteredLinks.length > 0" class="links-container">
      <div
        v-for="link in filteredLinks"
        :key="link.id"
        class="link-card"
      >
        <div class="link-card-inner">
          <div class="link-content" @click="openLink(link)">
            <div class="link-favicon" :style="{ backgroundColor: getCategoryColor(link.categoryId) + '15' }">
              <Globe :size="20" :style="{ color: getCategoryColor(link.categoryId) }" />
            </div>
            <div class="link-info">
              <div class="link-title-row">
                <h3 class="link-title">{{ link.title }}</h3>
                <button 
                  class="btn btn-link favorite-btn" 
                  @click.stop="toggleFavorite(link)"
                  :title="link.favorite ? '取消收藏' : '收藏'"
                >
                  <Star :size="16" :fill="link.favorite ? 'currentColor' : 'none'" :class="{ filled: link.favorite }" />
                </button>
              </div>
              <p class="link-description">{{ link.description }}</p>
              <div class="link-meta">
                <div class="link-tags">
                  <span
                    v-for="tag in link.tags"
                    :key="tag"
                    class="badge badge-primary"
                  >
                    {{ tag }}
                  </span>
                </div>
                <div class="link-visit-info">
                  <Clock :size="12" />
                  <span>{{ formatVisitCount(link.visitCount) }}</span>
                </div>
              </div>
            </div>
            <ExternalLink :size="16" class="link-external" />
          </div>
          <div class="link-actions">
            <button class="btn btn-secondary btn-sm action-btn" @click.stop="$emit('edit-link', link)" title="编辑">
              <Edit :size="14" />
            </button>
            <button class="btn btn-danger btn-sm action-btn" @click.stop="$emit('delete-link', link)" title="删除">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
        <div class="link-card-glow" v-if="link.favorite"></div>
      </div>
    </div>
    
    <div v-else class="empty-state">
      <Link :size="64" class="text-gray-300" />
      <h3>{{ searchQuery ? '未找到匹配的链接' : showFavoritesOnly ? '暂无收藏' : '暂无链接' }}</h3>
      <p>
        {{ searchQuery ? '尝试使用其他关键词搜索' : showFavoritesOnly ? '点击链接旁的星星图标收藏' : '点击上方按钮添加第一个链接' }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Plus, Globe, ExternalLink, Edit, Trash2, Link, Star, Clock, Folder } from 'lucide-vue-next'
import { store, AGE_STAGES } from '@/data/store'

const props = defineProps({
  category: Object,
  searchQuery: String,
  ageStages: Array
})

defineEmits(['add-link', 'edit-link', 'delete-link'])

const showFavoritesOnly = ref(false)

const filteredLinks = computed(() => {
  let links = props.category
    ? store.getLinksByCategory(props.category.id)
    : store.links
  
  if (showFavoritesOnly.value) {
    links = links.filter(l => l.favorite)
  }
  
  if (props.searchQuery) {
    const query = props.searchQuery.toLowerCase()
    links = links.filter(
      l => l.title.toLowerCase().includes(query) ||
           l.description.toLowerCase().includes(query) ||
           l.tags.some(t => t.toLowerCase().includes(query))
    )
  }
  
  if (props.ageStages && props.ageStages.length > 0) {
    links = links.filter(l => {
      const linkStages = l.ageStages || []
      return linkStages.some(stage => props.ageStages.includes(stage))
    })
  }
  
  return links.sort((a, b) => b.createdAt - a.createdAt)
})

function getIcon(iconName) {
  const iconMap = { Folder }
  return iconMap[iconName] || Link
}

function getCategoryColor(categoryId) {
  const category = store.getCategoryById(categoryId)
  return category?.color || '#6366f1'
}

function formatVisitCount(count) {
  if (!count || count === 0) return '未访问'
  if (count === 1) return '访问 1 次'
  return `访问 ${count} 次`
}

async function toggleFavorite(link) {
  await store.toggleFavorite(link.id)
}

function openLink(link) {
  store.recordVisit(link.id)
  window.open(link.url, '_blank')
}
</script>

<style scoped>
.link-list {
  padding: 1rem 0;
}

.link-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.link-list-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.links-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.link-card {
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.link-card-inner {
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  transition: all 0.25s ease;
}

.link-card:hover .link-card-inner {
  box-shadow: var(--shadow-lg);
  transform: translateY(-1px);
}

.link-card-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #f59e0b, #f97316, #f59e0b);
  animation: glow 2s ease-in-out infinite;
}

@keyframes glow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.link-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  cursor: pointer;
}

.link-favicon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.link-card:hover .link-favicon {
  transform: scale(1.1);
}

.link-info {
  flex: 1;
  min-width: 0;
}

.link-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.link-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.favorite-btn {
  flex-shrink: 0;
  color: var(--text-secondary);
  padding: 0.25rem;
}

.favorite-btn:hover {
  color: #f59e0b;
}

.favorite-btn .filled {
  color: #f59e0b;
}

.link-description {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.link-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.link-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.link-visit-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.link-external {
  color: var(--text-secondary);
  flex-shrink: 0;
  opacity: 0.6;
}

.link-card:hover .link-external {
  opacity: 1;
}

.link-actions {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  background-color: var(--bg-color);
  border-top: 1px solid var(--border-color);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
}

.action-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.empty-state {
  text-align: center;
  padding: 4rem 1rem;
  color: var(--text-secondary);
}

.empty-state h3 {
  margin-top: 1rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
}

.empty-state p {
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .link-list-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
  
  .header-actions {
    justify-content: flex-end;
  }
  
  .link-content {
    padding: 0.75rem;
  }
  
  .link-favicon {
    width: 36px;
    height: 36px;
  }
  
  .link-title {
    font-size: 0.875rem;
  }
  
  .link-description {
    font-size: 0.75rem;
  }
}
</style>