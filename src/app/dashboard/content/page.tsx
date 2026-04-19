'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, getStatusColor } from '@/lib/utils'
import type { ContentCalendarItem } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'

export default function ContentPage() {
  const router = useRouter()
  const [content, setContent] = useState<ContentCalendarItem[]>([])
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('content_calendar').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setContent((data || []) as ContentCalendarItem[]))
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    await fetch('/api/dashboard/generate-content', { method: 'POST' })
    const supabase = createClient()
    const { data } = await supabase.from('content_calendar').select('*').order('created_at', { ascending: false })
    setContent((data || []) as ContentCalendarItem[])
    setGenerating(false)
    router.refresh()
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
                  <button className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors font-medium">
                    Approve
                  </button>
                  <button className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors font-medium">
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
