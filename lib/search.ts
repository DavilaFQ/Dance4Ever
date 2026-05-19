export function normalize(s: string | null | undefined): string {
  if (!s) return ''
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

type Searchable = {
  name?: string | null
  academy?: string | null
  category?: string | null
  city?: string | null
  type?: string | null
  style?: string | null
  position?: number | null
}

export function participantMatches(p: Searchable, query: string): boolean {
  const q = normalize(query.trim())
  if (!q) return true
  const haystack = [p.name, p.academy, p.category, p.city, p.type, p.style, p.position?.toString()]
    .map(normalize)
    .join(' ')
  return haystack.includes(q)
}
