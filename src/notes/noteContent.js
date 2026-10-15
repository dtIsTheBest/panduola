import { normalizeSafeExternalUrl } from '../utils/externalLinks.js'

const LINK_PATTERN = /\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/giu
const TRAILING_PUNCTUATION = /[，。！？；：、,.!?;:]+$/u

function createTextToken(value) {
  return Object.freeze({ type: 'text', value })
}

function createLinkToken(label, href) {
  return Object.freeze({ type: 'link', label, href })
}

function tokenizeText(text) {
  const tokens = []
  let cursor = 0
  for (const match of text.matchAll(LINK_PATTERN)) {
    if (match.index > cursor) tokens.push(createTextToken(text.slice(cursor, match.index)))
    const markdownLabel = match[1]
    const rawUrl = match[2] ?? match[3]
    const trailing = markdownLabel ? '' : rawUrl.match(TRAILING_PUNCTUATION)?.[0] ?? ''
    const candidate = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl
    const safeUrl = normalizeSafeExternalUrl(candidate)
    if (safeUrl) {
      tokens.push(createLinkToken(markdownLabel ?? candidate, safeUrl))
      if (trailing) tokens.push(createTextToken(trailing))
    } else {
      tokens.push(createTextToken(match[0]))
    }
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) tokens.push(createTextToken(text.slice(cursor)))
  if (tokens.length === 0) tokens.push(createTextToken(text))
  return Object.freeze(tokens)
}

export function parseNoteContent(content) {
  if (typeof content !== 'string') return Object.freeze([])
  return Object.freeze([Object.freeze({
    id: 'content',
    tokens: tokenizeText(content)
  })])
}

export function createNoteExcerpt(content, { maximumCharacters = 600, maximumLines = 8 } = {}) {
  if (typeof content !== 'string') return ''
  const lines = content.split('\n').slice(0, maximumLines)
  const excerpt = Array.from(lines.join('\n')).slice(0, maximumCharacters).join('')
  return excerpt === content ? excerpt : `${excerpt.trimEnd()}…`
}
