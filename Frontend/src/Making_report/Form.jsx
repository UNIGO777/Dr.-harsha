import { useEffect, useMemo, useState } from 'react'
import dataFields, {
  familyHistoryFields,
  pastMedicalHistoryFields,
  patientBasicDetailsFields,
  surgicalHistoryFields
} from './DataFeilds'
import { searchMedicines, searchProcedures } from './clinicalTablesService'

const Form = () => {
  const getControlClassName = (hasError) =>
    [
      'h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2',
      hasError
        ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
        : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-100'
    ].join(' ')

  const pad2 = (n) => String(n).padStart(2, '0')
  const toIsoDate = (year, monthIndex, day) => `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
  const parseIsoDate = (value) => {
    if (typeof value !== 'string') return null
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    const year = Number(match[1])
    const monthIndex = Number(match[2]) - 1
    const day = Number(match[3])
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null
    if (monthIndex < 0 || monthIndex > 11) return null
    if (day < 1 || day > 31) return null
    const d = new Date(year, monthIndex, day)
    if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) return null
    return { year, monthIndex, day }
  }

  const monthLabel = (year, monthIndex) => {
    const d = new Date(year, monthIndex, 1)
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  }

  const buildCalendarCells = (year, monthIndex) => {
    const firstDay = new Date(year, monthIndex, 1).getDay()
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    const prevMonthDays = new Date(year, monthIndex, 0).getDate()
    const startOffset = firstDay
    const cells = []
    for (let i = 0; i < 42; i += 1) {
      const dayNumber = i - startOffset + 1
      if (dayNumber < 1) {
        const day = prevMonthDays + dayNumber
        cells.push({ day, inMonth: false, iso: '' })
      } else if (dayNumber > daysInMonth) {
        const day = dayNumber - daysInMonth
        cells.push({ day, inMonth: false, iso: '' })
      } else {
        cells.push({ day: dayNumber, inMonth: true, iso: toIsoDate(year, monthIndex, dayNumber) })
      }
    }
    return cells
  }

  const DatePicker = ({ id, value, placeholder, onChange, hasError = false }) => {
    const [open, setOpen] = useState(false)
    const [viewYear, setViewYear] = useState(() => {
      const parsed = parseIsoDate(value)
      if (parsed) return parsed.year
      return new Date().getFullYear()
    })
    const [viewMonthIndex, setViewMonthIndex] = useState(() => {
      const parsed = parseIsoDate(value)
      if (parsed) return parsed.monthIndex
      return new Date().getMonth()
    })
    const [draft, setDraft] = useState(() => (typeof value === 'string' ? value : ''))

    const openPicker = () => {
      const parsed = parseIsoDate(value)
      const now = new Date()
      setDraft(typeof value === 'string' ? value : '')
      setViewYear(parsed ? parsed.year : now.getFullYear())
      setViewMonthIndex(parsed ? parsed.monthIndex : now.getMonth())
      setOpen(true)
    }

    const onPrevMonth = () => {
      setViewMonthIndex((m) => {
        if (m === 0) {
          setViewYear((y) => y - 1)
          return 11
        }
        return m - 1
      })
    }

    const onNextMonth = () => {
      setViewMonthIndex((m) => {
        if (m === 11) {
          setViewYear((y) => y + 1)
          return 0
        }
        return m + 1
      })
    }

    const cells = buildCalendarCells(viewYear, viewMonthIndex)

    return (
      <div className="relative">
        <button
          type="button"
          id={id}
          onClick={() => (open ? setOpen(false) : openPicker())}
          className={[
            getControlClassName(hasError),
            'flex items-center justify-between gap-3 text-left',
            open ? 'ring-2 ring-emerald-100' : ''
          ].join(' ')}
        >
          <span className={value ? 'text-slate-900' : 'text-slate-400'}>
            {value || placeholder || 'Select date'}
          </span>
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-emerald-700"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>

        {open ? (
          <div className="absolute left-0 z-20 mt-2 w-[320px] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onPrevMonth}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-emerald-200"
              >
                <span className="sr-only">Previous month</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <div className="text-sm font-semibold text-slate-900">{monthLabel(viewYear, viewMonthIndex)}</div>

              <button
                type="button"
                onClick={onNextMonth}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-emerald-200"
              >
                <span className="sr-only">Next month</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((c, idx) => {
                const isSelected = c.iso && c.iso === draft
                return (
                  <button
                    key={`${c.day}_${idx}`}
                    type="button"
                    disabled={!c.inMonth}
                    onClick={() => c.iso && setDraft(c.iso)}
                    className={[
                      'h-9 rounded-lg text-sm',
                      c.inMonth ? 'text-slate-700 hover:bg-emerald-50' : 'cursor-not-allowed text-slate-300',
                      isSelected ? 'bg-emerald-600 font-semibold text-white hover:bg-emerald-600' : ''
                    ].join(' ')}
                  >
                    {c.day}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setDraft(typeof value === 'string' ? value : '')
                  setOpen(false)
                }}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(draft)
                  setOpen(false)
                }}
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const SearchSelect = ({ id, value, placeholder, onChange, searchFn }) => {
    const [query, setQuery] = useState(typeof value === 'string' ? value : '')
    const [open, setOpen] = useState(false)
    const [options, setOptions] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
      if (!open) setQuery(typeof value === 'string' ? value : '')
    }, [open, value])

    useEffect(() => {
      if (!open) return
      const q = query.trim()
      if (!q) {
        setOptions([])
        setError('')
        setIsLoading(false)
        return
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(async () => {
        setIsLoading(true)
        setError('')
        try {
          const fetcher = typeof searchFn === 'function' ? searchFn : searchProcedures
          const list = await fetcher(q, { signal: controller.signal })
          setOptions(list.slice(0, 8))
        } catch (e) {
          if (e?.name !== 'AbortError') setError('Search failed')
        } finally {
          setIsLoading(false)
        }
      }, 300)

      return () => {
        clearTimeout(timeoutId)
        controller.abort()
      }
    }, [open, query, searchFn])

    return (
      <div className="relative">
        <input
          id={id}
          value={query}
          placeholder={placeholder ?? 'Search...'}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className={getControlClassName(false)}
        />

        {open ? (
          <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-slate-600">Searching...</div>
            ) : error ? (
              <div className="px-3 py-2 text-sm text-red-600">{error}</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No results</div>
            ) : (
              <div className="max-h-64 overflow-auto">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(opt)
                      setQuery(opt)
                      setOpen(false)
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-emerald-50"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  const steps = [
    { id: 'patient', title: 'Patient Details' },
    { id: 'past', title: 'Past Medical History' },
    { id: 'surgical', title: 'Surgical History' },
    { id: 'family', title: 'Family History' },
    { id: 'summary', title: 'Summary' }
  ]

  const initialValues = useMemo(() => {
    return {
      ...dataFields.patientBasicDetailsInitialValues,
      ...dataFields.pastMedicalHistoryInitialValues,
      ...dataFields.surgicalHistoryInitialValues,
      ...dataFields.familyHistoryInitialValues
    }
  }, [])

  const [values, setValues] = useState(initialValues)
  const [generated, setGenerated] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [errors, setErrors] = useState({})
  const [imports, setImports] = useState(() => ({
    patient: { files: [], isImporting: false, error: '' },
    past: { files: [], isImporting: false, error: '' },
    surgical: { files: [], isImporting: false, error: '' },
    family: { files: [], isImporting: false, error: '' },
    summary: { files: [], isImporting: false, error: '' }
  }))

  const setFieldValue = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev || typeof prev !== 'object') return {}
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const setRepeatableValue = (listKey, index, itemKey, itemValue) => {
    setValues((prev) => {
      const list = Array.isArray(prev[listKey]) ? [...prev[listKey]] : []
      const current = list[index] ?? {}
      list[index] = { ...current, [itemKey]: itemValue }
      return { ...prev, [listKey]: list }
    })
  }

  const addRepeatableItem = (listKey, fields) => {
    const empty = Object.fromEntries(fields.map((f) => [f.key, '']))
    setValues((prev) => {
      const list = Array.isArray(prev[listKey]) ? [...prev[listKey]] : []
      return { ...prev, [listKey]: [...list, empty] }
    })
  }

  const removeRepeatableItem = (listKey, index) => {
    setValues((prev) => {
      const list = Array.isArray(prev[listKey]) ? [...prev[listKey]] : []
      list.splice(index, 1)
      return { ...prev, [listKey]: list }
    })
  }

  const extractJsonFromText = (text) => {
    if (typeof text !== 'string') return null
    const trimmed = text.trim()
    if (trimmed.length === 0) return null
    try {
      return JSON.parse(trimmed)
    } catch {
      const first = trimmed.indexOf('{')
      const last = trimmed.lastIndexOf('}')
      if (first === -1 || last === -1 || last <= first) return null
      try {
        return JSON.parse(trimmed.slice(first, last + 1))
      } catch {
        return null
      }
    }
  }

  const applyImportedData = (incoming, allowedKeys) => {
    if (!incoming || typeof incoming !== 'object') return

    setValues((prev) => {
      const next = { ...prev }

      const allow = (key) => !Array.isArray(allowedKeys) || allowedKeys.includes(key)

      if (allow('name') && typeof incoming.name === 'string') next.name = incoming.name
      if (allow('sex') && typeof incoming.sex === 'string') next.sex = incoming.sex
      if (allow('date') && typeof incoming.date === 'string') next.date = incoming.date

      if (allow('illness') && Array.isArray(incoming.illness)) next.illness = incoming.illness
      if (allow('medicalHistory') && Array.isArray(incoming.medicalHistory))
        next.medicalHistory = incoming.medicalHistory
      if (allow('surgeries') && Array.isArray(incoming.surgeries)) next.surgeries = incoming.surgeries
      if (allow('familyMembers') && Array.isArray(incoming.familyMembers))
        next.familyMembers = incoming.familyMembers

      return next
    })
  }

  const formatBytes = (bytes) => {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return ''
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
    const value = bytes / Math.pow(k, i)
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`
  }

  const setImportState = (stepId, patch) => {
    setImports((prev) => ({ ...prev, [stepId]: { ...prev[stepId], ...patch } }))
  }

  const setImportFiles = (stepId, files) => {
    setImportState(stepId, { files, error: '' })
  }

  const removeImportFile = (stepId, index) => {
    setImports((prev) => {
      const list = Array.isArray(prev[stepId]?.files) ? [...prev[stepId].files] : []
      list.splice(index, 1)
      return { ...prev, [stepId]: { ...prev[stepId], files: list } }
    })
  }

  const getImportConfig = (stepId) => {
    if (stepId === 'patient') {
      return {
        allowedKeys: ['name', 'sex', 'date'],
        prompt: [
          'Extract patient basic details from the attached document(s)/image(s). Return ONLY valid JSON.',
          'Return JSON with keys: name, sex, date.',
          'name/sex/date are strings. date should be YYYY-MM-DD if possible.'
        ].join('\n')
      }
    }

    if (stepId === 'past') {
      return {
        allowedKeys: ['medicalHistory', 'illness'],
        prompt: [
          'Extract past medical history items from the attached document(s)/image(s). Return ONLY valid JSON.',
          'Return JSON with key: medicalHistory.',
          'medicalHistory is array of { medicineName, answerType, answer }.',
          'answerType must be one of: yes_no, text, number, date, rating.'
        ].join('\n')
      }
    }

    if (stepId === 'surgical') {
      return {
        allowedKeys: ['surgeries'],
        prompt: [
          'Extract surgical history from the attached document(s)/image(s). Return ONLY valid JSON.',
          'Return JSON with key: surgeries.',
          'surgeries is array of { surgeryName, surgeryMonth, surgeryYear }.',
          'surgeryMonth optional. surgeryMonth should be "01".."12" when present. surgeryYear should be YYYY.'
        ].join('\n')
      }
    }

    if (stepId === 'family') {
      return {
        allowedKeys: ['familyMembers'],
        prompt: [
          'Extract family history from the attached document(s)/image(s). Return ONLY valid JSON.',
          'Return JSON with key: familyMembers.',
          'familyMembers is array of { relation, memberName, illness }.'
        ].join('\n')
      }
    }

    return {
      allowedKeys: ['name', 'sex', 'date', 'medicalHistory', 'illness', 'surgeries', 'familyMembers'],
      prompt: [
        'Extract patient report fields from the attached document(s)/image(s) and return ONLY valid JSON.',
        'Return JSON with keys: name, sex, date, medicalHistory, surgeries, familyMembers.',
        'name/sex/date are strings.',
        'medicalHistory is array of { medicineName, answerType, answer }.',
        'answerType must be one of: yes_no, text, number, date, rating.',
        'surgeries is array of { surgeryName, surgeryMonth, surgeryYear } (surgeryMonth optional).',
        'familyMembers is array of { relation, memberName, illness }.'
      ].join('\n')
    }
  }

  const importFromDocument = async (stepId) => {
    const files = Array.isArray(imports[stepId]?.files) ? imports[stepId].files : []
    if (files.length === 0) return

    setImportState(stepId, { error: '', isImporting: true })

    try {
      const { prompt, allowedKeys } = getImportConfig(stepId)
      const formData = new FormData()
      formData.append('prompt', prompt)
      for (const f of files) formData.append('files', f)

      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
      const res = await fetch(`${apiBase}/api/gpt`, { method: 'POST', body: formData })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setImportState(stepId, { error: data?.error || 'Import failed' })
        return
      }

      const json = extractJsonFromText(data?.content)
      if (!json) {
        setImportState(stepId, { error: 'Could not parse JSON from response' })
        return
      }

      applyImportedData(json, allowedKeys)
      setImportState(stepId, { files: [] })
    } catch (err) {
      setImportState(stepId, { error: err instanceof Error ? err.message : 'Import failed' })
    } finally {
      setImportState(stepId, { isImporting: false })
    }
  }

  const ImportCard = ({ stepId }) => {
    const inputId = `import_${stepId}`
    const state = imports[stepId] ?? { files: [], isImporting: false, error: '' }
    const files = Array.isArray(state.files) ? state.files : []

    const onDrop = (e) => {
      e.preventDefault()
      const dropped = Array.from(e.dataTransfer?.files ?? [])
      if (dropped.length === 0) return
      setImportFiles(stepId, dropped)
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-slate-900">Import from document or image</div>
            <div className="text-sm text-slate-600">Upload PDF or image to auto-fill this step.</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className="cursor-pointer rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Choose files
            </label>
            <input
              id={inputId}
              type="file"
              accept="application/pdf,image/*"
              multiple
              onChange={(e) => setImportFiles(stepId, Array.from(e.target.files ?? []))}
              className="hidden"
            />
            <button
              type="button"
              disabled={state.isImporting || files.length === 0}
              onClick={() => importFromDocument(stepId)}
              className={[
                'rounded-full px-5 py-2 text-sm font-semibold',
                state.isImporting || files.length === 0
                  ? 'cursor-not-allowed bg-emerald-200 text-white'
                  : 'bg-emerald-600 text-white'
              ].join(' ')}
            >
              {state.isImporting ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-white p-2 text-emerald-700 ring-1 ring-emerald-200">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5-5 5 5" />
                <path d="M12 5v12" />
              </svg>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold text-slate-900">Drag & drop files here</div>
              <div className="text-sm text-slate-600">PDF, PNG, JPG, WEBP supported.</div>
            </div>
          </div>

          {files.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {files.map((f, i) => (
                <div
                  key={`${f.name}_${i}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{f.name}</div>
                    <div className="text-xs text-slate-500">
                      {f.type || 'file'} • {formatBytes(f.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImportFile(stepId, i)}
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">{files.length} file(s) selected</div>
                <button
                  type="button"
                  onClick={() => setImportFiles(stepId, [])}
                  className="text-xs font-semibold text-slate-700"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          {state.error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const getAnswerInputType = (answerType) => {
    if (answerType === 'date') return 'date'
    if (answerType === 'number') return 'number'
    if (answerType === 'rating') return 'number'
    return 'text'
  }

  const renderSimpleField = (field) => {
    const id = `field_${field.key}`
    const value = values[field.key] ?? ''
    const error = errors?.[field.key]

    if (field.type === 'select') {
      if (field.key === 'sex') {
        return (
          <div key={field.key} className="flex flex-col gap-2">
            <div className="text-sm font-medium text-slate-700">{field.label}</div>
            {renderRadioGroup({
              name: id,
              value,
              options: field.options ?? [],
              onChange: (v) => setFieldValue(field.key, v)
            })}
            {error ? <div className="text-xs font-medium text-red-600">{error}</div> : null}
          </div>
        )
      }

      return (
        <div key={field.key} className="flex flex-col gap-1">
          <label htmlFor={id} className="text-sm font-medium text-slate-700">
            {field.label}
          </label>
          <select
            id={id}
            value={value}
            onChange={(e) => setFieldValue(field.key, e.target.value)}
            className={getControlClassName(Boolean(error))}
          >
            <option value="">Select</option>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {error ? <div className="text-xs font-medium text-red-600">{error}</div> : null}
        </div>
      )
    }

    const inputType = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'

    return (
      <div key={field.key} className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {field.label}
        </label>
        {inputType === 'date' ? (
          <DatePicker
            id={id}
            value={value}
            placeholder={field.placeholder ?? ''}
            onChange={(v) => setFieldValue(field.key, v)}
            hasError={Boolean(error)}
          />
        ) : (
          <input
            id={id}
            type={inputType}
            value={value}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => setFieldValue(field.key, e.target.value)}
            className={getControlClassName(Boolean(error))}
          />
        )}
        {error ? <div className="text-xs font-medium text-red-600">{error}</div> : null}
      </div>
    )
  }

  const renderRadioGroup = ({ name, value, options, onChange }) => {
    return (
      <div className="flex flex-wrap gap-3">
        {options.map((o) => {
          const checked = value === o.value
          return (
            <label
              key={o.value}
              className={[
                'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                checked
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700'
              ].join(' ')}
            >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={(e) => onChange(e.target.value)}
              className="h-4 w-4 accent-emerald-600"
            />
            <span>{o.label}</span>
            </label>
          )
        })}
      </div>
    )
  }

  const renderRating = ({ name, value, onChange, max = 5 }) => {
    const current = typeof value === 'string' ? value : ''
    const options = Array.from({ length: max }, (_, i) => String(i + 1))

    return (
      <div className="flex flex-wrap gap-2">
        {options.map((n) => {
          const checked = current === n
          return (
            <label
              key={n}
              className={[
                'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                checked
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700'
              ].join(' ')}
            >
            <input
              type="radio"
              name={name}
              value={n}
              checked={checked}
              onChange={(e) => onChange(e.target.value)}
              className="h-4 w-4 accent-emerald-600"
            />
            <span>{n}</span>
            </label>
          )
        })}
      </div>
    )
  }

  const renderRepeatable = (group) => {
    const listKey = group.key
    const list = Array.isArray(values[listKey]) ? values[listKey] : []

    return (
      <div key={group.key} className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">{group.label}</h3>
          <button
            type="button"
            onClick={() => addRepeatableItem(listKey, group.fields ?? [])}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Add
          </button>
        </div>

        {list.length === 0 ? (
          <div className="mt-3 text-sm text-slate-500">No items added.</div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {list.map((item, index) => (
              <div key={`${listKey}_${index}`} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-700">#{index + 1}</div>
                  <button
                    type="button"
                    onClick={() => removeRepeatableItem(listKey, index)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(group.fields ?? []).map((field) => {
                    const fieldId = `${listKey}_${index}_${field.key}`
                    const currentValue = item?.[field.key] ?? ''

                    if (listKey === 'medicalHistory' && field.key === 'medicineName') {
                      return (
                        <div key={field.key} className="flex flex-col gap-1">
                          <label
                            htmlFor={fieldId}
                            className="text-sm font-medium text-slate-700"
                          >
                            {field.label}
                          </label>
                          <SearchSelect
                            id={fieldId}
                            value={currentValue}
                            placeholder={field.placeholder ?? ''}
                            onChange={(v) => setRepeatableValue(listKey, index, field.key, v)}
                            searchFn={searchMedicines}
                          />
                        </div>
                      )
                    }

                    if (listKey === 'medicalHistory' && field.key === 'answer') {
                      const answerType = item?.answerType ?? ''
                      if (answerType === 'yes_no') {
                        return (
                          <div key={field.key} className="flex flex-col gap-1">
                            <div className="text-sm font-medium text-slate-700">
                              {field.label}
                            </div>
                            {renderRadioGroup({
                              name: fieldId,
                              value: currentValue,
                              options: [
                                { label: 'Yes', value: 'yes' },
                                { label: 'No', value: 'no' }
                              ],
                              onChange: (v) => setRepeatableValue(listKey, index, field.key, v)
                            })}
                          </div>
                        )
                      }

                      if (answerType === 'rating') {
                        return (
                          <div key={field.key} className="flex flex-col gap-1">
                            <div className="text-sm font-medium text-slate-700">{field.label}</div>
                            {renderRating({
                              name: fieldId,
                              value: currentValue,
                              onChange: (v) => setRepeatableValue(listKey, index, field.key, v),
                              max: 5
                            })}
                          </div>
                        )
                      }

                      return (
                        <div key={field.key} className="flex flex-col gap-1">
                          <label
                            htmlFor={fieldId}
                            className="text-sm font-medium text-slate-700"
                          >
                            {field.label}
                          </label>
                          {getAnswerInputType(answerType) === 'date' ? (
                            <DatePicker
                              id={fieldId}
                              value={currentValue}
                              placeholder={field.placeholder ?? ''}
                              onChange={(v) => setRepeatableValue(listKey, index, field.key, v)}
                            />
                          ) : (
                            <input
                              id={fieldId}
                              type={getAnswerInputType(answerType)}
                              value={currentValue}
                              placeholder={field.placeholder ?? ''}
                              onChange={(e) =>
                                setRepeatableValue(listKey, index, field.key, e.target.value)
                              }
                              className={getControlClassName(false)}
                            />
                          )}
                        </div>
                      )
                    }

                    if (field.type === 'select') {
                      return (
                        <div key={field.key} className="flex flex-col gap-1">
                          <label
                            htmlFor={fieldId}
                            className="text-sm font-medium text-slate-700"
                          >
                            {field.label}
                          </label>
                          <select
                            id={fieldId}
                            value={currentValue}
                            onChange={(e) =>
                              setValues((prev) => {
                                const list = Array.isArray(prev[listKey]) ? [...prev[listKey]] : []
                                const current = list[index] ?? {}
                                const nextItem = { ...current, [field.key]: e.target.value }
                                if (listKey === 'medicalHistory' && field.key === 'answerType') {
                                  nextItem.answer = ''
                                }
                                list[index] = nextItem
                                return { ...prev, [listKey]: list }
                              })
                            }
                            className={getControlClassName(false)}
                          >
                            <option value="">Select</option>
                            {field.options?.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    }

                    const inputType =
                      field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'

                    return (
                      <div key={field.key} className="flex flex-col gap-1">
                        <label
                          htmlFor={fieldId}
                          className="text-sm font-medium text-slate-700"
                        >
                          {field.label}
                        </label>
                        {inputType === 'date' ? (
                          <DatePicker
                            id={fieldId}
                            value={currentValue}
                            placeholder={field.placeholder ?? ''}
                            onChange={(v) => setRepeatableValue(listKey, index, field.key, v)}
                          />
                        ) : (
                          <input
                            id={fieldId}
                            type={inputType}
                            value={currentValue}
                            placeholder={field.placeholder ?? ''}
                            onChange={(e) =>
                              setRepeatableValue(listKey, index, field.key, e.target.value)
                            }
                            className={getControlClassName(false)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const onGenerate = (e) => {
    e.preventDefault()
    setGenerated(values)
  }

  const canGoBack = stepIndex > 0
  const validatePatientStep = (currentValues) => {
    const nextErrors = {}
    const name = String(currentValues?.name ?? '').trim()
    const sex = String(currentValues?.sex ?? '').trim()
    const date = String(currentValues?.date ?? '').trim()

    if (!name) nextErrors.name = 'Name is required'

    const sexField = patientBasicDetailsFields.find((f) => f.key === 'sex')
    const allowedSex = new Set((sexField?.options ?? []).map((o) => o.value))
    if (!sex) nextErrors.sex = 'Sex is required'
    else if (allowedSex.size > 0 && !allowedSex.has(sex)) nextErrors.sex = 'Select a valid sex'

    if (!date) nextErrors.date = 'Date is required'
    else if (!parseIsoDate(date)) nextErrors.date = 'Select a valid date'

    return nextErrors
  }

  const goToStep = (nextIndex) => {
    if (nextIndex <= stepIndex) {
      setStepIndex(Math.max(0, Math.min(steps.length - 1, nextIndex)))
      return
    }

    const currentStepId = steps[stepIndex]?.id
    if (currentStepId === 'patient') {
      const nextErrors = validatePatientStep(values)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) return
    }

    setStepIndex(Math.max(0, Math.min(steps.length - 1, nextIndex)))
  }

  return (
    <form onSubmit={onGenerate} className="mx-auto w-full  p-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 h-screen bg-white shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] h-full">
          <aside className="bg-emerald-50 px-6 py-8">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-emerald-700">Create report</div>
              <div className="text-2xl font-bold text-slate-900">Patient Report</div>
            </div>

            <div className="mt-8 hidden lg:block">
              <div className="relative">
                <div className="absolute left-[15px] top-4 h-[calc(100%-16px)] w-px bg-emerald-200" />
                <div className="flex flex-col gap-6">
                  {steps.map((s, i) => {
                    const isActive = i === stepIndex
                    const isDone = i < stepIndex
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => goToStep(i)}
                        className="flex items-center gap-4 text-left"
                      >
                        <div
                          className={[
                            'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold',
                            isDone
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : isActive
                                ? 'border-emerald-600 bg-white text-emerald-700'
                                : 'border-emerald-200 bg-white text-emerald-400'
                          ].join(' ')}
                        >
                          {isDone ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </div>
                        <div className="flex flex-col">
                          <div
                            className={[
                              'text-sm font-semibold',
                              isActive ? 'text-slate-900' : isDone ? 'text-slate-700' : 'text-slate-500'
                            ].join(' ')}
                          >
                            {s.title}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2 overflow-auto lg:hidden">
              {steps.map((s, i) => {
                const isActive = i === stepIndex
                const isDone = i < stepIndex
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToStep(i)}
                    className={[
                      'whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold',
                      isActive
                        ? 'border-emerald-600 bg-white text-emerald-700'
                        : isDone
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-emerald-200 bg-white text-slate-600'
                    ].join(' ')}
                  >
                    {i + 1}. {s.title}
                  </button>
                )
              })}
            </div>
          </aside>

          <main className="px-6 py-8">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold text-emerald-700">
                Step {stepIndex + 1} of {steps.length}
              </div>
              <h2 className="text-2xl font-bold text-slate-900">{steps[stepIndex]?.title}</h2>
            </div>

            <div className="mt-6">
              {steps[stepIndex]?.id === 'patient' ? (
                <div className="flex flex-col gap-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="text-sm font-semibold text-slate-900">Basic details</div>
                    <div className="mt-4 flex flex-col gap-4">
                      {patientBasicDetailsFields.map(renderSimpleField)}
                    </div>
                  </div>
                </div>
              ) : null}

              {steps[stepIndex]?.id === 'past' ? (
                <div className="flex flex-col gap-6">
                  <ImportCard stepId="past" />
                  {pastMedicalHistoryFields.map(renderRepeatable)}
                </div>
              ) : null}

              {steps[stepIndex]?.id === 'surgical' ? (
                <div className="flex flex-col gap-6">
                  <ImportCard stepId="surgical" />
                  {surgicalHistoryFields.map(renderRepeatable)}
                </div>
              ) : null}

              {steps[stepIndex]?.id === 'family' ? (
                <div className="flex flex-col gap-6">
                  <ImportCard stepId="family" />
                  {familyHistoryFields.map(renderRepeatable)}
                </div>
              ) : null}

              {steps[stepIndex]?.id === 'summary' ? (
                <div className="flex flex-col gap-6">
                  <ImportCard stepId="summary" />
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">Generated JSON</div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="submit"
                          className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
                        >
                          Generate
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setValues(initialValues)
                            setGenerated(null)
                            setErrors({})
                            setStepIndex(0)
                          }}
                          className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      {generated ? (
                        <pre className="max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                          {JSON.stringify(generated, null, 2)}
                        </pre>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                          Click Generate to create JSON output.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6">
              <button
                type="button"
                disabled={!canGoBack}
                onClick={() => setStepIndex((s) => Math.max(0, s - 1))}
                className={[
                  'rounded-full border px-5 py-2.5 text-sm font-semibold',
                  canGoBack
                    ? 'border-slate-300 text-slate-700'
                    : 'cursor-not-allowed border-slate-200 text-slate-400'
                ].join(' ')}
              >
                Back
              </button>

              <div className="flex items-center gap-2">
                {steps[stepIndex]?.id !== 'summary' ? (
                  <button
                    type="button"
                    onClick={() => goToStep(stepIndex + 1)}
                    className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white"
                  >
                    Next
                  </button>
                ) : null}
              </div>
            </div>
          </main>
        </div>
      </div>
    </form>
  )
}

export default Form
