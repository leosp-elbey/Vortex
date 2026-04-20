'use client'

import { useState, useEffect } from 'react'
import { formatDate, getStatusColor } from '@/lib/utils'
import type { ContentCalendarItem } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useToast, Toaster } from '@/components/ui/toast'

export default function ContentPage() {
  const [content, setContent] = useState<ContentCalendarItem[]>([])
  const [generating, setGenerating] = useState(false)
  const { toasts, show } = useToast()

  useEffect(() => {
    const supabase = createClient()
    supabase.from('content_calendar').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setContent((data || []) as ContentCalendarItem[]))
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/dashboard/generate-content', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to generate')
      const supabase = createClient()
      const { data } = await supabase.from('content_calendar').select('*').order('created_at', { ascending: false })
      setContent((data || []) as ContentCalendarItem[])
      show('Content generated successfully')
    } catch {
      show('Failed to generate content', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch('/api/content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (!res.ok) { show('Failed to update status', 'error'); return }
    setContent(prev => prev.map(item => item.id === id ? { ...item, status: status as ContentCalendarItem['status'] } : item))
    show(`Post ${status}`)
  }

  const platformEmoji: Record<string, string> = {
    instagram: '📸',
    facebook: '👥',
    tiktok: '🎵',
    twitter: '🐦',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#1A1A2E]">Content Calendar</h1>
          <p className="text-gray-500">{content.length} posts total</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-[#FF6B35] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#e55a25] transition-colors disabled:opacity-60"
        >
          {generating ? 'Generating...' : '✨ Generate This Week'}
        </button>
      </div>

      <div className="grid gap-4">
        {content.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            <p className="text-4xl mb-3">✍️</p>
            <p>No content yet. Click &quot;Generate This Week&quot; to create your first batch of posts.</p>
          </div>
        ) : (
          content.map((item) => (
            <div key={item.id} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="text-2xl flex-shrink-0">{platformEmoji[item.platform] || '📱'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-semibold text-[#1A1A2E] capitalize">{item.platform}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-gray-400">Week of {formatDate(item.week_of)}</span>
                    </div>
                    <p className="text-gray-700 text-sm leading-relaxed mb-3">{item.caption}</p>
                    {item.hashtags && item.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {item.hashtags.map(tag => (
                          <span key={tag} className="text-[#FF6B35] text-xs">#{tag}</span>
                        ))}
                      </div>
                    )}
                    {item.image_prompt && (
                      <p className="text-xs text-gray-400 italic">Image: {item.image_prompt}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {item.status === 'draft' && (
                    <>
                      <button
                        onClick={() => updateStatus(item.id, 'approved')}
                        className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors font-medium"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => updateStatus(item.id, 'rejected')}
                        className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors font-medium"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {item.status === 'approved' && (
                    <button
                      onClick={() => updateStatus(item.id, 'posted')}
                      className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                    >
                      Mark Posted
                    </button>
                  )}
                  {(item.status === 'rejected' || item.status === 'posted') && (
                    <button
                      onClick={() => updateStatus(item.id, 'draft')}
                      className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Toaster toasts={toasts} />
    </div>
  )
}
