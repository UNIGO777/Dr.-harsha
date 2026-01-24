export const searchProcedures = async (terms, { signal } = {}) => {
  const q = typeof terms === 'string' ? terms.trim() : ''
  if (!q) return []

  const url = `https://clinicaltables.nlm.nih.gov/api/procedures/v3/search?terms=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Search failed')

  const data = await res.json().catch(() => null)
  const raw = Array.isArray(data) ? data[3] : null
  const list = Array.isArray(raw) ? raw : []

  return list
    .map((item) => (Array.isArray(item) ? item[0] : item))
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
}

export const searchMedicines = async (name, { signal } = {}) => {
  const q = typeof name === 'string' ? name.trim() : ''
  if (!q) return []

  const encoded = encodeURIComponent(q).replace(/%20/g, '+')
  const url = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encoded}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Search failed')

  const data = await res.json().catch(() => null)
  const groups = Array.isArray(data?.drugGroup?.conceptGroup) ? data.drugGroup.conceptGroup : []
  const names = []

  const extractInsideBraces = (text) => {
    if (typeof text !== 'string') return ''
    const match = text.match(/\{([^}]*)\}/)
    return (match?.[1] ?? '').trim()
  }

  for (const g of groups) {
    const props = Array.isArray(g?.conceptProperties) ? g.conceptProperties : []
    for (const p of props) {
      const raw = typeof p?.name === 'string' ? p.name.trim() : ''
      if (!raw) continue
      const inside = extractInsideBraces(raw)
      names.push(inside || raw)
    }
  }

  return Array.from(new Set(names))
}
