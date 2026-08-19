import { computed } from 'vue'
import { store } from '../data/store.js'

export function buildCategoryLinkCountMap(categories, links) {
  const directCounts = new Map()
  for (const link of links) {
    directCounts.set(link.categoryId, (directCounts.get(link.categoryId) || 0) + 1)
  }

  const counts = new Map(directCounts)
  for (const category of categories) {
    let total = directCounts.get(category.id) || 0
    for (const child of category.children || []) {
      total += directCounts.get(child.id) || 0
    }
    counts.set(category.id, total)
  }
  return counts
}

export function useCategoryLinkCounts() {
  const categoryLinkCounts = computed(() => (
    buildCategoryLinkCountMap(store.categories, store.links)
  ))

  function getCategoryLinkCount(categoryId) {
    return categoryLinkCounts.value.get(categoryId) || 0
  }

  return {
    categoryLinkCounts,
    getCategoryLinkCount
  }
}
