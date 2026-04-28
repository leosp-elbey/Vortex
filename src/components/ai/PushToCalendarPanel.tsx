'use client'

import { useState } from 'react'

type Platform = 'instagram' | 'facebook' | 'tiktok' | 'twitter'

interface PostRow {
  platform: Platform
  caption: string
  hashtags: string  // comma-separated, parsed on submit
  image_prompt: string
  week_of: string  // YYYY-MM-DD
}

interface PushToCalendarPanelProps {
  jobId: string
  notify: (msg: string, type?: 'success' | 'error') => void
}

const POSTING_NOT_IMPLEMENTED = new Set<Platform>(['tiktok', 'twitter'])

function emptyRow(): PostRow {
  return {
    platform: 'instagram',
    caption: '',
    hashtags: '',
    image_prompt: '',
    week_of: new Date().toISOString().slice(0, 10),
  }
}

export default function PushToCalendarPanel({ jobId, notify }: PushToCalendarPanelProps) {
  const [rows, setRows] = useState<PostRow[]>([emptyRow()])
  const [loading, setLoading] = useState(false)

  const updateRow = (index: number, patch: Partial<PostRow>) => {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index))

  const submit = async () => {
    const cleaned = rows
      .map(r => ({
        platform: r.platform,
        caption: r.caption.trim(),
        hashtags: r.hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean),
        image_prompt: r.image_prompt.trim() || undefined,
        week_of: r.week_of,
      }))
      .filter(r => r.caption.length > 0)

    if (cleaned.length === 0) {
      return notify('Add at least one row with a caption', 'error')
    }

    setLoading(true)
    try {
      const res = await fetch('/api/ai/push-to-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, posts: cleaned }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to push')

      const warnings = (data.warnings ?? []) as string[]
      notify(
        `Pushed ${data.inserted} post${data.inserted === 1 ? '' : 's'} to calendar${warnings.length > 0 ? '. ' + warnings.join(' ') : ''}`,
      )
      setRows([emptyRow()])
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Push failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#1A1A2E]">Push to Content Calendar</p>
        <button
          onClick={addRow}
          className="text-xs px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-50 font-semibold"
        >
          + Add row
        </button>
      </div>

      <p className="text-xs text-gray-600">
        Copy each post from the output above into a row. Approved rows go into <code>content_calendar</code>.
        TikTok and Twitter inserts are draft-only — no posting route exists yet.
      </p>

      {rows.map((r, i) => {
        const draftOnly = POSTING_NOT_IMPLEMENTED.has(r.platform)
        return (
          <div key={i} className="bg-white rounded-lg p-3 border border-gray-200 space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={r.platform}
                onChange={e => updateRow(i, { platform: e.target.value as Platform })}
                className="text-xs px-2 py-1 rounded border border-gray-300"
              >
                <option value="instagram">instagram</option>
                <option value="facebook">facebook</option>
                <option value="tiktok">tiktok (draft only)</option>
                <option value="twitter">twitter (draft only)</option>
              </select>
              <input
                type="date"
                value={r.week_of}
                onChange={e => updateRow(i, { week_of: e.target.value })}
                className="text-xs px-2 py-1 rounded border border-gray-300"
              />
              {draftOnly && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                  draft only
                </span>
              )}
              {rows.length > 1 && (
                <button
                  onClick={() => removeRow(i)}
                  className="ml-auto text-xs text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
            <textarea
              value={r.caption}
              onChange={e => updateRow(i, { caption: e.target.value })}
              placeholder="Caption..."
              rows={3}
              className="w-full text-xs px-2 py-1 rounded border border-gray-300 font-mono"
            />
            <input
              type="text"
              value={r.hashtags}
              onChange={e => updateRow(i, { hashtags: e.target.value })}
              placeholder="Hashtags (comma-separated, no #)"
              className="w-full text-xs px-2 py-1 rounded border border-gray-300"
            />
            <input
              type="text"
              value={r.image_prompt}
              onChange={e => updateRow(i, { image_prompt: e.target.value })}
              placeholder="Image prompt (optional)"
              className="w-full text-xs px-2 py-1 rounded border border-gray-300"
            />
          </div>
        )
      })}

      <button
        onClick={submit}
        disabled={loading}
        className="w-full bg-[#16C79A] hover:bg-emerald-600 disabled:opacity-60 text-white font-bold py-2 rounded-lg text-sm transition-colors"
      >
        {loading ? 'Pushing...' : `Push ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} to calendar`}
      </button>
    </div>
  )
}
