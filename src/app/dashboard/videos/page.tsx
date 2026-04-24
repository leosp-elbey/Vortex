'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function VideosPageInner() {
  const searchParams = useSearchParams()
  const [videoId, setVideoId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null)
  const [ytConnected, setYtConnected] = useState(false)
  const [heygenStatus, setHeygenStatus] = useState<'idle' | 'generating' | 'polling' | 'done' | 'error'>('idle')
  const [ytStatus, setYtStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [heygenMsg, setHeygenMsg] = useState('')
  const [ytMsg, setYtMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Check URL params from OAuth callback
    if (searchParams.get('yt_connected') === '1') setYtConnected(true)
    if (searchParams.get('yt_error')) setYtMsg(`Connection failed: ${searchParams.get('yt_error')}`)

    // Load existing state from Supabase via public API
    fetch('/api/sba-video').then(r => r.json()).then(d => {
      if (d.video_url) setVideoUrl(d.video_url)
    })
    fetch('/api/sba-video?key=sba_youtube_url').then(r => r.json()).then(d => {
      if (d.video_url) { setYoutubeUrl(d.video_url); setYtConnected(true) }
    })
    fetch('/api/sba-video?key=youtube_refresh_token').then(r => r.json()).then(d => {
      if (d.video_url) setYtConnected(true)
    })
  }, [searchParams])

  const stopPolling = () => { if (pollRef.current) clearInterval(pollRef.current) }
  useEffect(() => () => stopPolling(), [])

  const generateHeygen = async () => {
    setHeygenStatus('generating')
    setHeygenMsg('Sending script to HeyGen…')
    setVideoUrl(null)
    try {
      const res = await fetch('/api/admin/generate-sba-video', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setVideoId(data.video_id)
      setHeygenStatus('polling')
      setHeygenMsg('Video is processing — this takes 2–4 minutes…')
      pollRef.current = setInterval(async () => {
        const r = await fetch(`/api/admin/sba-video-status?video_id=${data.video_id}`)
        const d = await r.json()
        if (d.status === 'completed' && d.video_url) {
          stopPolling(); setVideoUrl(d.video_url); setHeygenStatus('done'); setHeygenMsg('Video ready!')
        } else if (d.status === 'failed') {
          stopPolling(); setHeygenStatus('error'); setHeygenMsg('HeyGen reported a failure. Try regenerating.')
        }
      }, 15000)
    } catch (e) {
      setHeygenStatus('error')
      setHeygenMsg(e instanceof Error ? e.message : 'Generation failed')
    }
  }

  const uploadToYouTube = async () => {
    if (!videoUrl) return
    setYtStatus('uploading')
    setYtMsg('Uploading to YouTube — this may take a few minutes…')
    try {
      const res = await fetch('/api/admin/upload-to-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setYoutubeUrl(data.youtube_url)
      setYtStatus('done')
      setYtMsg('Uploaded successfully!')
    } catch (e) {
      setYtStatus('error')
      setYtMsg(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  const statusColor = (s: string) =>
    s === 'error' ? 'bg-red-50 text-red-600' :
    s === 'done' ? 'bg-green-50 text-green-700' :
    'bg-blue-50 text-blue-700'

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-black text-gray-900 mb-2">AI Videos</h1>
      <p className="text-gray-500 mb-8">Generate and publish Maya avatar videos across platforms.</p>

      {/* SBA Opportunity Video */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">SBA Opportunity Video</h2>
            <p className="text-sm text-gray-500 mt-1">
              Maya pitches the earn-with-VortexTrips opportunity. Auto-displays on <code className="bg-gray-100 px-1 rounded">/sba</code>.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-orange-100 text-orange-700">~2 min</span>
        </div>

        {videoUrl ? (
          <div className="mb-6">
            <video src={videoUrl} controls className="w-full rounded-xl bg-black" style={{ maxHeight: 320 }} />
            <p className="text-xs text-gray-400 mt-2">
              Live on <a href="/sba" target="_blank" className="text-[#FF6B35] underline">/sba</a>
              {youtubeUrl && <> · <a href={youtubeUrl} target="_blank" className="text-red-500 underline">YouTube ↗</a></>}
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl h-40 flex items-center justify-center mb-6 border border-dashed border-gray-300">
            <p className="text-gray-400 text-sm">No video generated yet</p>
          </div>
        )}

        {heygenMsg && (
          <div className={`text-sm mb-4 px-4 py-3 rounded-lg ${statusColor(heygenStatus)}`}>
            {heygenStatus === 'polling' && <span className="mr-2 animate-pulse">⏳</span>}
            {heygenMsg}
            {videoId && heygenStatus !== 'done' && (
              <span className="block text-xs mt-1 opacity-60">ID: {videoId}</span>
            )}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={generateHeygen}
            disabled={heygenStatus === 'generating' || heygenStatus === 'polling'}
            className="bg-[#FF6B35] text-white font-bold px-6 py-3 rounded-xl hover:bg-orange-600 transition disabled:opacity-50 text-sm"
          >
            {heygenStatus === 'generating' ? 'Starting…' :
             heygenStatus === 'polling' ? 'Processing…' :
             videoUrl ? '🔄 Regenerate' : '🎬 Generate SBA Video'}
          </button>

          {videoUrl && (
            <a
              href={videoUrl}
              download="vortextrips-sba-video.mp4"
              className="border border-gray-300 text-gray-700 font-bold px-6 py-3 rounded-xl hover:bg-gray-50 transition text-sm"
            >
              ⬇ Download MP4
            </a>
          )}
        </div>
      </div>

      {/* YouTube */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">YouTube</h2>
            <p className="text-sm text-gray-500 mt-1">Connect your channel once, then upload any HeyGen video with one click.</p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${ytConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {ytConnected ? '✓ Connected' : 'Not connected'}
          </span>
        </div>

        {ytMsg && (
          <div className={`text-sm mb-4 px-4 py-3 rounded-lg ${statusColor(ytStatus === 'error' ? 'error' : ytStatus === 'done' ? 'done' : 'uploading')}`}>
            {ytStatus === 'uploading' && <span className="mr-2 animate-pulse">⏳</span>}
            {ytMsg}
            {youtubeUrl && (
              <a href={youtubeUrl} target="_blank" className="block mt-1 underline font-medium">{youtubeUrl}</a>
            )}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {!ytConnected ? (
            <a
              href="/api/auth/youtube"
              className="bg-red-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-red-700 transition text-sm"
            >
              🔗 Connect YouTube Channel
            </a>
          ) : (
            <button
              onClick={uploadToYouTube}
              disabled={!videoUrl || ytStatus === 'uploading'}
              className="bg-red-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-red-700 transition disabled:opacity-50 text-sm"
            >
              {ytStatus === 'uploading' ? '⏳ Uploading…' : '▶ Upload SBA Video to YouTube'}
            </button>
          )}
          {ytConnected && (
            <a
              href="/api/auth/youtube"
              className="border border-gray-300 text-gray-600 font-medium px-4 py-3 rounded-xl hover:bg-gray-50 transition text-sm"
            >
              Reconnect
            </a>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Videos generated by HeyGen · Maya avatar · Hope voice · Stored in Supabase Storage
      </p>
    </div>
  )
}

export default function VideosPage() {
  return (
    <Suspense>
      <VideosPageInner />
    </Suspense>
  )
}
