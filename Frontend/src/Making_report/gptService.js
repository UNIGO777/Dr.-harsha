const getApiBase = () => import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export const uploadToGpt = async ({ prompt, files, apiBase, signal }) => {
  const normalizedPrompt = typeof prompt === 'string' ? prompt : ''
  const list = Array.isArray(files) ? files : []
  const base = typeof apiBase === 'string' && apiBase.trim() ? apiBase.trim() : getApiBase()

  const formData = new FormData()
  formData.append('prompt', normalizedPrompt)
  for (const f of list) formData.append('files', f)

  const res = await fetch(`${base}/api/gpt`, { method: 'POST', body: formData, signal })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message = typeof data?.error === 'string' && data.error.trim() ? data.error : 'Import failed'
    throw new Error(message)
  }

  return data
}
