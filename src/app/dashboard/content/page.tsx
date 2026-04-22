'use client'

import { useState, useEffect } from 'react'
import { formatDate, getStatusColor } from '@/lib/utils'
import type { ContentCalendarItem } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useToast, Toaster } from '@/components/ui/toast'

type ExtendedContentItem = ContentCalendarItem & {
  image_url?: string | null
  video_script?: string | null
}

const platformEmoji: Record<string, string> = {
  instagram: '📸',
  facebook: '👥',
  tiktok: '🎵',
  twitter: '🐦',
}

const platformLabel: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  twitter: 'Twitter / X',
}

export default function ContentPage() {
  const [content, setContent] = useState<ExtendedContentItem[]>([])
  const [generating, setGenerating] = useState(false)
  const [expandedScript, setExpandedScript] = useState<string | null>(null)
  const { toasts, show } = useToast()

  useEffect(() => {
    const supabase = createClient()
    supabase.from('content_calendar').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setContent((data || []) as ExtendedContentItem[]))
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/dashboard/generate-content', { method: 'POST' })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to generate')
      const supabase = createClient()
      const { data } = await supabase.from('content_calendar').select('*').order('created_at', { ascending: false })
      setContent((data || []) as ExtendedContentItem[])
      show(`Generated ${result.generated} posts · ${result.images_generated ?? 0} images created`)
    } catch (err) {
      show(err instanceof Error ? err.message : 'Failed to generate content', 'error')
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

  const postToInstagram = async (item: ExtendedContentItem) => {
    const res = await fetch('/api/automations/post-to-instagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_id: item.id }),
    })
    if (res.ok) {
      setContent(prev => prev.map(c => c.id === item.id ? { ...c, status: 'posted' as ContentCalendarItem['status'] } : c))
      show('Posted to Instagram!')
    } else {
      const d = await res.json()
      show(d.error ?? 'Instagram post failed', 'error')
    }
  }

  const postToFacebook = async (item: ExtendedContentItem) => {
    const res = await fetch('/api/automations/post-to-facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_id: item.id }),
    })
    if (res.ok) {
      setContent(prev => prev.map(c => c.id === item.id ? { ...c, status: 'posted' as ContentCalendarItem['status'] } : c))
      show('Posted to Facebook!')
    } else {
      const d = await res.json()
      show(d.error ?? 'Facebook post failed', 'error')
    }
  }

  const stats = {
    total: content.length,
    draft: content.filter(c => c.status === 'draft').length,
    approved: content.filter(c => c.status === 'approved').length,
    posted: content.filter(c => c.status === 'posted').length,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#1A1A2E]">Content Calendar</h1>
          <div className="flex gap-4 mt-1 text-sm text-gray-500">
            <span>{stats.total} total</span>
            <span className="text-yellow-600">{stats.draft} drafts</span>
            <span className="text-green-600">{stats.approved} approved</span>
            <span className="text-blue-600">{stats.posted} posted</span>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-[#FF6B35] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#e55a25] transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {generating ? (
            <><span className="animate-spin">⏳</span> Generating + Creating Images...</>
          ) : (
            <>✨ Generate This Week</>
          )}
        </button>
      </div>

      <div className="grid gap-4">
        {content.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            <p className="text-4xl mb-3">✍️</p>
            <p>No content yet. Click &quot;Generate This Week&quot; to create posts with AI-generated images.</p>
          </div>
        ) : (
          content.map((item) => (
            <div key={item.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">

                  {/* Left: image + content */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Image preview or platform icon */}
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt="Post image"
                        className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-3xl flex-shrink-0">
                        {platformEmoji[item.platform] || '📱'}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-semibold text-[#1A1A2E]">
                          {platformEmoji[item.platform]} {platformLabel[item.platform] || item.platform}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                        {item.image_url && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">
                            🎨 AI Image
                          </span>
                        )}
                        <span className="text-xs text-gray-400">Week of {formatDate(item.week_of)}</span>
                      </div>

                      <p className="text-gray-700 text-sm leading-relaxed mb-2">{item.caption}</p>

                      {item.hashtags && item.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.hashtags.map(tag => (
                            <span key={tag} className="text-[#FF6B35] text-xs">#{tag}</span>
                          ))}
                        </div>
                      )}

                      {item.image_prompt && !item.image_url && (
                        <p className="text-xs text-gray-400 italic">Image prompt: {item.image_prompt}</p>
                      )}

                      {/* TikTok video script */}
                      {item.video_script && (
                        <div className="mt-3">
                          <button
                            onClick={() => setExpandedScript(expandedScript === item.id ? null : item.id)}
                            className="text-xs text-[#FF6B35] font-semibold hover:underline flex items-center gap-1"
                          >
                            🎬 {expandedScript === item.id ? 'Hide' : 'Show'} Video Script
                          </button>
                          {expandedScript === item.id && (
                            <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono border border-gray-200">
                              {item.video_script}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {item.status === 'draft' && (
                      <>
                        <button
                          onClick={() => updateStatus(item.id, 'approved')}
                          className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 transition-colors font-medium"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => updateStatus(item.id, 'rejected')}
                          className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 transition-colors font-medium"
                        >
                          ✕ Reject
                        </button>
                      </>
                    )}

                    {item.status === 'approved' && (
                      <>
                        {item.platform === 'instagram' && (
                          <button
                            onClick={() => postToInstagram(item)}
                            className="text-xs bg-pink-100 text-pink-700 px-3 py-1.5 rounded-lg hover:bg-pink-200 transition-colors font-medium"
                          >
                            📸 Post to IG
                          </button>
                        )}
                        {item.platform === 'facebook' && (
                          <button
                            onClick={() => postToFacebook(item)}
                            className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                          >
                            👥 Post to FB
                          </button>
                        )}
                        {item.platform === 'tiktok' && (
                          <a
                            href="https://www.tiktok.com/creator-center/upload"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors font-medium text-center"
                          >
                            🎵 Upload to TikTok
                          </a>
                        )}
                        {item.platform === 'twitter' && (
                          <a
                            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(item.caption)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-sky-100 text-sky-700 px-3 py-1.5 rounded-lg hover:bg-sky-200 transition-colors font-medium text-center"
                          >
                            🐦 Tweet
                          </a>
                        )}
                        <button
                          onClick={() => updateStatus(item.id, 'posted')}
                          className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                        >
                          ✓ Mark Posted
                        </button>
                      </>
                    )}

                    {(item.status === 'rejected' || item.status === 'posted') && (
                      <button
                        onClick={() => updateStatus(item.id, 'draft')}
                        className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                      >
                        ↺ Reset
                      </button>
                    )}
                  </div>
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
