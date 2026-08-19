import { nextTick, watch } from 'vue'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

function isHTMLElement(element) {
  return typeof HTMLElement !== 'undefined' && element instanceof HTMLElement
}

export function getVisibleFocusableElements(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(element => element.offsetParent !== null)
}

export function useDialogFocus({
  isVisible,
  dialogRef,
  initialFocus,
  fallbackFocus,
  onEscape,
  isFocusTrapPaused = () => false
}) {
  let previousFocus = null

  watch(isVisible, async (visible) => {
    if (visible) {
      previousFocus = isHTMLElement(document.activeElement) ? document.activeElement : null
      await nextTick()
      const target = initialFocus?.() || getVisibleFocusableElements(dialogRef.value)[0]
      if (isHTMLElement(target)) target.focus()
      return
    }

    const target = previousFocus || fallbackFocus?.()
    previousFocus = null
    await nextTick()
    if (isHTMLElement(target) && target.isConnected) target.focus()
  })

  function handleDialogKeydown(event) {
    if (isFocusTrapPaused()) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onEscape?.()
      return
    }
    if (event.key !== 'Tab') return

    const focusableElements = getVisibleFocusableElements(dialogRef.value)
    if (!focusableElements.length) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return { handleDialogKeydown }
}
