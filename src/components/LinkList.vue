<template>
  <div class="link-list">
    <div class="link-list-header">
      <h2 class="link-list-title">
        <component :is="getIcon(category?.icon || 'Link')" :size="20" />
        {{ category?.name || '全部链接' }}
      </h2>
      <button class="btn btn-primary btn-sm" @click="$emit('add-link')">
        <Plus :size="16" /> 添加链接
      </button>
    </div>
    
    <div v-if="filteredLinks.length > 0" class="links-container">
      <div
        v-for="link in filteredLinks"
        :key="link.id"
        class="link-card"
      >
        <div class="link-content" @click="openLink(link)">
          <div class="link-favicon">
            <Globe :size="20" />
          </div>
          <div class="link-info">
                <h3 class="link-title">{{ link.title }}</h3>
                <p class="link-description">{{ link.description }}</p>
                <div class="link-meta">
                  <div class="link-stages" v-if="link.ageStages && link.ageStages.length">
                    <span
                      v-for="stageId in link.ageStages"
                      :key="stageId"
                      class="badge badge-secondary"
                    >
                      {{ getStageTitle(stageId) }}
                    </span>
                  </div>
                  <div class="link-tags">
                    <span
                      v-for="tag in link.tags"
                      :key="tag"
                      class="badge badge-primary"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
              </div>
          <ExternalLink :size="16" class="link-external" />
        </div>
        <div class="link-actions">
          <button class="btn btn-secondary btn-sm" @click.stop="$emit('edit-link', link)">
            <Edit :size="14" />
          </button>
          <button class="btn btn-danger btn-sm" @click.stop="$emit('delete-link', link)">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
    </div>
    
    <div v-else class="empty-state">
      <Link :size="64" class="text-gray-300" />
      <h3>{{ searchQuery ? '未找到匹配的链接' : '暂无链接' }}</h3>
      <p>{{ searchQuery ? '尝试使用其他关键词搜索' : '点击上方按钮添加第一个链接' }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Plus, Globe, ExternalLink, Edit, Trash2, Link, Folder } from 'lucide-vue-next'
import { store, AGE_STAGES } from '@/data/store'

const props = defineProps({
  category: Object,
  searchQuery: String,
  ageStages: Array
})

defineEmits(['add-link', 'edit-link', 'delete-link'])

const filteredLinks = computed(() => {
  let links = props.category
    ? store.getLinksByCategory(props.category.id)
    : store.links
  
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

function getStageTitle(stageId) {
  const stage = AGE_STAGES.find(s => s.id === stageId)
  return stage ? stage.title : stageId
}

function openLink(link) {
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

.links-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.link-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-color);
  transition: box-shadow 0.2s ease;
}

.link-card:hover {
  box-shadow: var(--shadow-md);
}

.link-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  cursor: pointer;
}

.link-favicon {
  width: 40px;
  height: 40px;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.link-info {
  flex: 1;
  min-width: 0;
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
  gap: 0.5rem;
  align-items: center;
}

.link-stages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.link-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.link-external {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.link-actions {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  background-color: var(--bg-color);
  border-top: 1px solid var(--border-color);
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
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
</style>
