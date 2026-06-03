// Pull a group id out of whatever the user pastes into "Join" \u2014 either a full
// invite link (\u2026/g/<id>) or the raw id on its own.
export function parseGroupRef(input) {
  const text = (input || '').trim()
  if (!text) return ''
  const match = text.match(/\/g\/([^/?#\s]+)/)
  if (match) return decodeURIComponent(match[1])
  return text.replace(/^.*[/#]/, '') // strip any stray prefix
}

// Default starter categories offered when a group has none yet.
export const STARTER_CATEGORIES = [
  { name: 'Restaurant', emoji: '🍽️' },
  { name: 'Coffee', emoji: '☕' },
  { name: 'Gas', emoji: '⛽' },
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Drinks', emoji: '🍻' },
  { name: 'Taxi', emoji: '🚕' },
]

export const EMOJI_CHOICES = [
  '🍽️', '☕', '⛽', '🛒', '🍻', '🚕', '🍕', '🎬', '🎮', '🏝️',
  '🛍️', '💊', '🧾', '🏠', '🎁', '✈️', '🚗', '🍦', '🍣', '💸',
]
