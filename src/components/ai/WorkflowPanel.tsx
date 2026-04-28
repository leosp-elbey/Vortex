'use client'

import { useState } from 'react'

type WorkflowKind = 'generic' | 'blog' | 'email-sequence' | 'video-script' | 'social-pack' | 'social-calendar'

interface WorkflowPanelProps {
  onJobCreated: (jobId: string) => void
  notify: (msg: string, type?: 'success' | 'error') => void
}

const TABS: { id: WorkflowKind; label: string; icon: string }[] = [
  { id: 'generic', label: 'Generic', icon: '⚙️' },
  { id: 'blog', label: 'Blog', icon: '📝' },
  { id: 'email-sequence', label: 'Email Drip', icon: '✉️' },
  { id: 'video-script', label: 'Video Script', icon: '🎬' },
  { id: 'social-pack', label: 'Social Pack', icon: '📱' },
  { id: 'social-calendar', label: '30-Day Calendar', icon: '📅' },
]

const JOB_TYPES = [
  'ideas', 'captions', 'hashtags', 'outlines',
  'scripts', 'emails', 'landing-copy', 'blog',
  'code', 'security-review', 'compliance',
  'social-pack', 'video-script', 'email-sequence', 'social-calendar',
] as const

export default function WorkflowPanel({ onJobCreated, notify }: WorkflowPanelProps) {
  const [tab, setTab] = useState<WorkflowKind>('generic')
  const [loading, setLoading] = useState(false)

  // Generic
  const [genJobType, setGenJobType] = useState<typeof JOB_TYPES[number]>('captions')
  const [genTitle, setGenTitle] = useState('')
  const [genPrompt, setGenPrompt] = useState('')

  // Blog
  const [blogTopic, setBlogTopic] = useState('')
  const [blogWords, setBlogWords] = useState(800)
  const [blogAudience, setBlogAudience] = useState('')

  // Email
  const [emailGoal, setEmailGoal] = useState('')
  const [emailSteps, setEmailSteps] = useState(5)
  const [emailAudience, setEmailAudience] = useState<'lead' | 'free-member' | 'paid-member' | 'sba-affiliate'>('lead')

  // Video
  const [videoTopic, setVideoTopic] = useState('')
  const [videoPlatform, setVideoPlatform] = useState<'tiktok' | 'instagram-reels' | 'youtube-shorts'>('tiktok')
  const [videoDuration, setVideoDuration] = useState(60)

  // Social pack
  const [packTheme, setPackTheme] = useState('')
  const [packPlatforms, setPackPlatforms] = useState<('instagram' | 'facebook' | 'tiktok' | 'twitter')[]>(['instagram', 'facebook'])

  // Social calendar
  const [calTheme, setCalTheme] = useState('')
  const [calPlatforms, setCalPlatforms] = useState<('instagram' | 'facebook' | 'tiktok' | 'twitter')[]>(['instagram', 'facebook'])
  const [calDays, setCalDays] = useState(30)
  const [calStart, setCalStart] = useState(new Date().toISOString().slice(0, 10))

  const togglePlatform = (
    platform: 'instagram' | 'facebook' | 'tiktok' | 'twitter',
    state: typeof packPlatforms,
    setter: (s: typeof packPlatforms) => void,
  ) => {
    if (state.includes(platform)) setter(state.filter(p => p !== platform))
    else setter([...state, platform])
  }

  const submit = async (path: string, body: object) => {
    setLoading(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      notify(`Job created — status: ${data.status}`)
      onJobCreated(data.jobId)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = () => {
    if (tab === 'generic') {
      if (!genTitle.trim() || !genPrompt.trim()) return notify('Title and prompt required', 'error')
      return submit('/api/ai/jobs/create', { jobType: genJobType, title: genTitle, prompt: genPrompt })
    }
    if (tab === 'blog') {
      if (!blogTopic.trim()) return notify('Topic required', 'error')
      return submit('/api/ai/generate/blog', {
        topic: blogTopic,
        targetWords: blogWords,
        audience: blogAudience.trim() || undefined,
      })
    }
    if (tab === 'email-sequence') {
      if (!emailGoal.trim()) return notify('Goal required', 'error')
      return submit('/api/ai/generate/email-sequence', { goal: emailGoal, steps: emailSteps, audience: emailAudience })
    }
    if (tab === 'video-script') {
      if (!videoTopic.trim()) return notify('Topic required', 'error')
      return submit('/api/ai/generate/video-script', { topic: videoTopic, platform: videoPlatform, durationSec: videoDuration })
    }
    if (tab === 'social-pack') {
      if (!packTheme.trim()) return notify('Theme required', 'error')
      if (packPlatforms.length === 0) return notify('Pick at least one platform', 'error')
      return submit('/api/ai/generate/social-pack', { theme: packTheme, platforms: packPlatforms })
    }
    if (tab === 'social-calendar') {
      if (!calTheme.trim()) return notify('Theme required', 'error')
      if (calPlatforms.length === 0) return notify('Pick at least one platform', 'error')
      return submit('/api/ai/generate/social-calendar', {
        theme: calTheme,
        platforms: calPlatforms,
        days: calDays,
        startDate: calStart,
      })
    }
  }

  const PlatformChips = ({ state, setter }: { state: typeof packPlatforms; setter: (s: typeof packPlatforms) => void }) => (
    <div className="flex flex-wrap gap-2">
      {(['instagram', 'facebook', 'tiktok', 'twitter'] as const).map(p => {
        const active = state.includes(p)
        const draftOnly = p === 'tiktok' || p === 'twitter'
        return (
          <button
            key={p}
            type="button"
            onClick={() => togglePlatform(p, state, setter)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              active
                ? 'bg-[#FF6B35] text-white border-[#FF6B35]'
                : 'bg-white text-gray-700 border-gray-300 hover:border-[#FF6B35]'
            }`}
          >
            {p}{draftOnly && active ? ' (draft only)' : ''}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <h3 className="text-lg font-bold text-[#1A1A2E] mb-3">Generate</h3>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100 -mx-6 px-6 pb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-[#1A1A2E] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'generic' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Job Type</label>
            <select value={genJobType} onChange={e => setGenJobType(e.target.value as typeof JOB_TYPES[number])} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm">
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
            <input type="text" value={genTitle} onChange={e => setGenTitle(e.target.value)} placeholder="Short label for this job" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Prompt</label>
            <textarea value={genPrompt} onChange={e => setGenPrompt(e.target.value)} rows={6} placeholder="What should the model generate?" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono" />
          </div>
        </div>
      )}

      {tab === 'blog' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Topic</label>
            <input type="text" value={blogTopic} onChange={e => setBlogTopic(e.target.value)} placeholder='e.g., "How to plan a luxury trip on a budget"' className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Target Words</label>
              <input type="number" value={blogWords} onChange={e => setBlogWords(Number(e.target.value))} min={300} max={2500} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Audience (optional)</label>
              <input type="text" value={blogAudience} onChange={e => setBlogAudience(e.target.value)} placeholder='e.g., "first-time travelers"' className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
            </div>
          </div>
          {blogWords >= 1500 && (
            <p className="text-xs text-amber-600">⚠️ Generations over 1500 words may exceed Vercel&apos;s 10s function limit and time out.</p>
          )}
        </div>
      )}

      {tab === 'email-sequence' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Goal</label>
            <input type="text" value={emailGoal} onChange={e => setEmailGoal(e.target.value)} placeholder='e.g., "Re-engage cold leads with a special offer"' className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Steps</label>
              <input type="number" value={emailSteps} onChange={e => setEmailSteps(Number(e.target.value))} min={2} max={10} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Audience</label>
              <select value={emailAudience} onChange={e => setEmailAudience(e.target.value as typeof emailAudience)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm">
                <option value="lead">Lead</option>
                <option value="free-member">Free member</option>
                <option value="paid-member">Paid member</option>
                <option value="sba-affiliate">SBA affiliate</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {tab === 'video-script' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Topic</label>
            <input type="text" value={videoTopic} onChange={e => setVideoTopic(e.target.value)} placeholder='e.g., "Why Cancun all-inclusives are 50% off this month"' className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Platform</label>
              <select value={videoPlatform} onChange={e => setVideoPlatform(e.target.value as typeof videoPlatform)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm">
                <option value="tiktok">TikTok</option>
                <option value="instagram-reels">Instagram Reels</option>
                <option value="youtube-shorts">YouTube Shorts</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Duration (sec)</label>
              <input type="number" value={videoDuration} onChange={e => setVideoDuration(Number(e.target.value))} min={15} max={180} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
            </div>
          </div>
          <p className="text-xs text-gray-500">Output is a script. Video rendering still happens via HeyGen — separate tool.</p>
        </div>
      )}

      {tab === 'social-pack' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Theme</label>
            <input type="text" value={packTheme} onChange={e => setPackTheme(e.target.value)} placeholder='e.g., "Spring break savings"' className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Platforms</label>
            <PlatformChips state={packPlatforms} setter={setPackPlatforms} />
          </div>
        </div>
      )}

      {tab === 'social-calendar' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Theme</label>
            <input type="text" value={calTheme} onChange={e => setCalTheme(e.target.value)} placeholder='e.g., "Summer travel — Caribbean, Europe, Vegas"' className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Platforms</label>
            <PlatformChips state={calPlatforms} setter={setCalPlatforms} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Days</label>
              <input type="number" value={calDays} onChange={e => setCalDays(Number(e.target.value))} min={7} max={60} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
              <input type="date" value={calStart} onChange={e => setCalStart(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
            </div>
          </div>
          {calDays * calPlatforms.length > 60 && (
            <p className="text-xs text-amber-600">⚠️ {calDays * calPlatforms.length} posts requested. Max is 60 to stay within the 10s function limit.</p>
          )}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full mt-4 bg-[#FF6B35] hover:bg-[#e55a25] disabled:opacity-60 text-white font-bold py-3 rounded-lg transition-colors"
      >
        {loading ? 'Generating...' : 'Generate'}
      </button>
    </div>
  )
}
