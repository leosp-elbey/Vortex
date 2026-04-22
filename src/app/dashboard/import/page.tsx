'use client'

import { useState, useRef, useCallback } from 'react'

interface ParsedRow {
  first_name: string
  last_name: string
  email: string
  phone: string
  source: string
  notes: string
  valid: boolean
  error?: string
}

const EXPECTED_COLUMNS = ['first_name', 'last_name', 'email', 'phone', 'source', 'notes']

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''))

  return lines.slice(1).map(line => {
    // Handle quoted fields
    const cols: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuote = !inQuote; continue }
      if (line[i] === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue }
      cur += line[i]
    }
    cols.push(cur.trim())

    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cols[i] ?? '' })

    const email = (obj.email || obj.email_address || obj['e-mail'] || '').trim().toLowerCase()
    const first_name = (obj.first_name || obj.firstname || obj.first || obj.name || '').trim()
    const last_name = (obj.last_name || obj.lastname || obj.last || '').trim()
    const phone = (obj.phone || obj.phone_number || obj.mobile || '').trim()
    const source = (obj.source || 'import').trim()
    const notes = (obj.notes || obj.note || '').trim()

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    return {
      first_name,
      last_name,
      email,
      phone,
      source,
      notes,
      valid: !!first_name && emailValid,
      error: !first_name ? 'Missing first name' : !emailValid ? 'Invalid email' : undefined,
    }
  }).filter(r => r.email !== '' || r.first_name !== '')
}

export default function ImportPage() {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      setRows(parseCSV(text))
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) handleFile(file)
  }, [])

  const validRows = rows.filter(r => r.valid)
  const invalidRows = rows.filter(r => !r.valid)

  const handleImport = async () => {
    if (validRows.length === 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validRows.map(r => ({
            first_name: r.first_name,
            last_name: r.last_name || undefined,
            email: r.email,
            phone: r.phone || undefined,
            source: r.source || 'import',
            notes: r.notes || undefined,
          })),
          sequence: 'mlm-outreach',
        }),
      })
      const data = await res.json()
      setResult(data)
      if (data.inserted > 0) setRows([])
    } catch {
      setResult({ inserted: 0, skipped: 0, errors: ['Network error — please try again'] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-[#1A1A2E]">Bulk Import Leads</h1>
        <p className="text-gray-500 mt-1">Upload a CSV of contacts — they'll be enrolled in the 6-month MLM email nurture sequence automatically.</p>
      </div>

      {/* Template download hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
        <strong>CSV format:</strong> Include columns <code className="bg-blue-100 px-1 rounded">first_name, last_name, email, phone, source, notes</code> — only <strong>first_name</strong> and <strong>email</strong> are required. Extra columns are ignored.
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors mb-6 ${
          dragging ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-300 hover:border-[#FF6B35] hover:bg-orange-50/30'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <div className="text-4xl mb-3">📥</div>
        <p className="text-lg font-semibold text-gray-700">Drop your CSV here or click to browse</p>
        <p className="text-sm text-gray-400 mt-1">Supports .csv files up to 10,000 rows</p>
        {fileName && <p className="mt-3 text-sm font-medium text-[#FF6B35]">Loaded: {fileName}</p>}
      </div>

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-semibold">{validRows.length} valid</span>
              {invalidRows.length > 0 && <span className="text-red-500 font-semibold">{invalidRows.length} invalid (will be skipped)</span>}
              <span className="text-gray-500">{rows.length} total rows</span>
            </div>
            <button
              onClick={handleImport}
              disabled={loading || validRows.length === 0}
              className="bg-[#FF6B35] text-white font-bold px-6 py-2 rounded-lg hover:bg-orange-600 transition disabled:opacity-50"
            >
              {loading ? 'Importing…' : `Import ${validRows.length} Contacts`}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">First Name</th>
                  <th className="px-4 py-3 text-left">Last Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, 100).map((row, i) => (
                  <tr key={i} className={row.valid ? '' : 'bg-red-50'}>
                    <td className="px-4 py-2">
                      {row.valid
                        ? <span className="text-green-600 text-xs font-semibold">✓ OK</span>
                        : <span className="text-red-500 text-xs font-semibold" title={row.error}>✗ {row.error}</span>
                      }
                    </td>
                    <td className="px-4 py-2">{row.first_name || <span className="text-red-400 italic">missing</span>}</td>
                    <td className="px-4 py-2 text-gray-500">{row.last_name}</td>
                    <td className="px-4 py-2">{row.email || <span className="text-red-400 italic">missing</span>}</td>
                    <td className="px-4 py-2 text-gray-500">{row.phone}</td>
                    <td className="px-4 py-2 text-gray-500">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && (
              <p className="text-center text-sm text-gray-400 py-3">Showing first 100 of {rows.length} rows</p>
            )}
          </div>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div className={`rounded-xl p-6 ${result.inserted > 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
          <h3 className={`font-bold text-lg mb-2 ${result.inserted > 0 ? 'text-green-700' : 'text-yellow-700'}`}>
            {result.inserted > 0 ? 'Import Complete' : 'Import Finished'}
          </h3>
          <div className="text-sm space-y-1">
            <p><strong>{result.inserted}</strong> contacts imported and enrolled in 6-month MLM email sequence</p>
            {result.skipped > 0 && <p className="text-gray-500"><strong>{result.skipped}</strong> duplicates skipped (email already in CRM)</p>}
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-red-600 font-semibold">Errors:</p>
                <ul className="list-disc list-inside text-red-500 text-xs mt-1">
                  {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sequence info */}
      <div className="mt-10 bg-gray-50 rounded-xl p-6">
        <h2 className="font-bold text-[#1A1A2E] mb-4">What happens after import</h2>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-semibold text-orange-600 mb-2">Immediate Sequence (Days 1–15)</h3>
            <ul className="space-y-1 text-gray-600">
              <li>📧 Day 0 — Pattern interrupt: the travel product</li>
              <li>📧 Day 2 — Price comparison demo</li>
              <li>📧 Day 4 — SBA earnings breakdown</li>
              <li>📧 Day 6 — Objection handling</li>
              <li>📧 Day 9 — Network marketer testimonials</li>
              <li>📧 Day 12 — Travel vs supplements comparison</li>
              <li>📧 Day 15 — Hard close</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-blue-600 mb-2">Long-Term Nurture (Months 1–6)</h3>
            <ul className="space-y-1 text-gray-600">
              <li>📧 Month 1 (Day 30) — Soft re-engagement</li>
              <li>📧 Month 2 (Day 60) — Real savings story</li>
              <li>📧 Month 3 (Day 90) — Quarter FOMO check-in</li>
              <li>📧 Month 4 (Day 120) — Summer travel push</li>
              <li>📧 Month 5 (Day 150) — Content strategy story</li>
              <li>📧 Month 6 (Day 180) — Final respectful close</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">Email-only sequence — no SMS until the contact opts in via the SBA landing page.</p>
      </div>
    </div>
  )
}
