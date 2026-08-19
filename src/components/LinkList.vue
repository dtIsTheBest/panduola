<template>
  <div class="link-list">
    <div class="link-list-header">
      <div class="link-list-title-row">
        <button class="btn btn-secondary btn-sm back-btn" aria-label="返回概览" title="返回概览" @click="$emit('back')">
          <ArrowLeft :size="16" />
          <span>返回概览</span>
        </button>
        <div class="link-list-heading">
          <h2 class="link-list-title">
            <component :is="getIcon(category?.icon || 'Link')" :size="20" />
            {{ getTitle() }}
          </h2>
          <p class="link-list-summary">{{ getSummary() }}</p>
        </div>
      </div>
      <div class="header-actions">
        <button
          class="btn btn-secondary btn-sm"
          :class="{ active: favoritesActive }"
          @click="toggleFavoritesFilter"
        >
          <Star :size="14" :fill="favoritesActive ? 'currentColor' : 'none'" />
          {{ favoritesActive ? '查看全部' : '只看收藏' }}
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
          <div class="link-content" role="link" tabindex="0" @click="openLink(link)" @keydown.enter.self.prevent="openLink(link)">
            <div class="link-favicon" :style="{ backgroundColor: getCategoryColor(link.categoryId) + '15' }">
              <Globe :size="20" :style="{ color: getCategoryColor(link.categoryId) }" />
            </div>
            <div class="link-info">
              <div class="link-title-row">
                <h3 class="link-title">{{ link.title }}</h3>
                <span v-if="link.isDefault" class="link-tag tag-default">精选</span>
                <button
                  class="btn btn-link favorite-btn"
                  @click.stop="toggleFavorite(link)"
                  :aria-label="link.favorite ? `取消收藏 ${link.title}` : `收藏 ${link.title}`"
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
            <button class="btn btn-secondary btn-sm action-btn" :aria-label="`编辑 ${link.title}`" @click.stop="$emit('edit-link', link)" title="编辑">
              <Edit :size="14" />
              <span>编辑</span>
            </button>
            <button class="btn btn-danger btn-sm action-btn" :aria-label="`删除 ${link.title}`" @click.stop="$emit('delete-link', link)" title="删除">
              <Trash2 :size="14" />
              <span>删除</span>
            </button>
          </div>
        </div>
        <div class="link-card-glow" v-if="link.favorite"></div>
      </div>
    </div>

    <div v-else class="empty-state">
      <Link :size="64" class="text-gray-300" />
      <h3>{{ searchQuery ? '没有找到匹配资源' : favoritesActive ? '还没有收藏资源' : '这里还没有资源' }}</h3>
      <p>
        {{ searchQuery ? '试试更短的关键词，或搜索标签名称' : favoritesActive ? '在资源卡片上点击星标即可收藏' : '添加常用网站或资料，方便以后快速查找' }}
      </p>
      <button v-if="!searchQuery" class="btn btn-primary empty-action" @click="favoritesActive ? toggleFavoritesFilter() : $emit('add-link')">
        <component :is="favoritesActive ? Link : Plus" :size="16" />
        {{ favoritesActive ? '浏览全部资源' : '添加第一个资源' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Plus, Globe, ExternalLink, Edit, Trash2, Link, Star, Clock, Folder, ArrowLeft } from 'lucide-vue-next'
import { store } from '@/data/store'
import { openExternalLink } from '@/utils/externalLinks'

const props = defineProps({
  category: Object,
  searchQuery: String,
  ageStages: Array,
  filterMode: String
})

const emit = defineEmits(['add-link', 'edit-link', 'delete-link', 'back', 'filter-change'])

const showFavoritesOnly = ref(false)
const favoritesActive = computed(() => props.filterMode === 'favorites' || showFavoritesOnly.value)

const filteredLinks = computed(() => {
  let links = props.category
    ? [...store.getLinksByCategory(props.category.id)]
    : [...store.links]

  if (favoritesActive.value) {
    links = links.filter(l => l.favorite)
  }

  if (props.filterMode === 'today') {
    const today = new Date().setHours(0, 0, 0, 0)
    links = links.filter(l => l.createdAt >= today)
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
      return linkStages.length === 0 || linkStages.some(stage => props.ageStages.includes(stage))
    })
  }

  return links.sort((a, b) => b.createdAt - a.createdAt)
})

function getIcon(iconName) {
  const iconMap = { Folder }
  return iconMap[iconName] || Link
}

function getTitle() {
  if (favoritesActive.value) return '我的收藏'
  if (props.filterMode === 'today') return '今日收录'
  return props.category?.name || '全部资源'
}

function getSummary() {
  const countText = `共 ${filteredLinks.value.length} 条资源`
  if (props.searchQuery) return `${countText} · 当前搜索“${props.searchQuery}”`
  if (favoritesActive.value) return `${countText} · 只显示已收藏内容`
  if (props.ageStages?.length) return `${countText} · 已按成长阶段筛选`
  if (props.category) return `${countText} · 当前分类`
  return `${countText} · 点击卡片即可打开`
}

function getCategoryColor(categoryId) {
  const category = store.getCategoryById(categoryId)
  return category?.color || '#6366f1'
}

function formatVisitCount(count) {
  if (!count || count === 0) return '尚未访问'
  if (count === 1) return '访问 1 次'
  return `访问 ${count} 次`
}

async function toggleFavorite(link) {
  try {
    await store.toggleFavorite(link.id)
  } catch {
    alert('收藏状态保存失败，请稍后重试')
  }
}

function openLink(link) {
  if (!openExternalLink(link.url)) {
    alert('该链接地址不安全或格式无效')
    return
  }
  store.recordVisit(link.id).catch(() => {
    console.warn('链接已打开，但访问次数保存失败')
  })
}

function toggleFavoritesFilter() {
  if (props.filterMode === 'favorites') {
    emit('filter-change', '')
    return
  }
  showFavoritesOnly.value = !showFavoritesOnly.value
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

.link-list-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.back-btn {
  padding: 0.375rem;
}

.link-list-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
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
  opacity: 0.9;
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

.link-tag {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.tag-default {
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.tag-custom {
  background-color: rgba(16, 185, 129, 0.1);
  color: #10b981;
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

.link-list {
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 0;
}

.link-list-header {
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), var(--primary-soft));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.link-list-title-row {
  min-width: 0;
}

.back-btn {
  flex: 0 0 auto;
  padding: 0.4rem 0.65rem;
  white-space: nowrap;
}

.link-list-heading {
  min-width: 0;
}

.link-list-title {
  min-width: 0;
  font-size: 1.08rem;
  font-weight: 750;
  color: var(--text-primary);
}

.link-list-title :deep(svg) {
  color: var(--primary-dark);
}

.link-list-summary {
  margin-top: 0.18rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.4;
}

.header-actions {
  flex-wrap: wrap;
}

.header-actions .active {
  color: #7a550b;
  background-color: var(--warm-soft);
  border-color: rgba(242, 173, 74, 0.28);
}

.links-container {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 0.85rem;
}

.link-card {
  border-radius: var(--radius-xl);
}

.link-card-inner {
  display: flex;
  height: 100%;
  flex-direction: column;
  background: linear-gradient(145deg, #ffffff, var(--surface-soft));
  border-color: rgba(220, 235, 230, 0.96);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.link-card:hover .link-card-inner {
  border-color: rgba(40, 127, 116, 0.2);
  box-shadow: var(--shadow-md);
}

.link-card-glow {
  z-index: 1;
  height: 4px;
  background: linear-gradient(90deg, var(--warm-color), var(--accent-color));
}

.link-content {
  flex: 1;
  align-items: flex-start;
  min-height: 88px;
  padding: 1rem 1.05rem;
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
}

.link-content:focus-visible {
  outline: 2px solid var(--primary-dark);
  outline-offset: -4px;
}

.link-favicon {
  width: 48px;
  height: 48px;
  border-radius: 1rem;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.74);
}

.link-card:hover .link-favicon {
  transform: translateY(-1px) scale(1.04);
}

.link-title {
  font-size: 0.96rem;
  font-weight: 700;
}

.link-description {
  color: var(--text-secondary);
  line-height: 1.55;
}

.favorite-btn {
  width: 34px;
  min-height: 34px;
  height: 34px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: none;
}

.favorite-btn:hover {
  color: #7a550b;
  background-color: var(--warm-soft);
}

.favorite-btn .filled {
  color: #9a6508;
}

.link-tag {
  padding: 0.17rem 0.44rem;
  font-weight: 650;
}

.tag-default {
  color: var(--primary-dark);
  background-color: var(--primary-soft);
}

.link-actions {
  justify-content: flex-end;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  background-color: rgba(237, 245, 242, 0.72);
}

.action-btn {
  width: auto;
  min-height: 34px;
  height: 34px;
  padding: 0 0.6rem;
}

.empty-state {
  min-height: 360px;
  padding: 3rem 1rem;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.94), var(--surface-soft));
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-sm);
}

.empty-state :deep(svg) {
  color: var(--primary-light);
}

.empty-state h3 {
  font-weight: 700;
}

.empty-action {
  margin-top: 1rem;
}

@media (max-width: 1080px) {
  .links-container {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .link-list-header {
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .link-list-title-row {
    align-items: flex-start;
  }

  .header-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .header-actions .btn {
    width: 100%;
  }

  .link-content {
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.8rem;
  }

  .link-favicon {
    width: 40px;
    height: 40px;
  }

  .link-external {
    display: none;
  }

  .link-actions {
    padding: 0.5rem 0.75rem;
  }
}

@media (max-width: 480px) {
  .link-list-title {
    font-size: 0.98rem;
  }

  .link-title-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .link-title {
    max-width: calc(100% - 42px);
    white-space: normal;
  }

  .favorite-btn {
    align-self: flex-start;
  }
}
</style>
