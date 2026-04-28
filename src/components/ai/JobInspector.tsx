'use client'

import { useState, useEffect, useCallback } from 'react'
import VerificationPanel from './VerificationPanel'
import PushToCalendarPanel from './PushToCalendarPanel'

interface AIJob {
  id: string
  job_type: string
  title: string
  status: string
  model_used: string | null
  cost_estimate: number | null
  output_payload: { content?: string } | null
  error_message: string | null
  verification_status: string | null
  created_at: string
  completed_at: string | null
}

interface VerificationLog {
  id: string
  verification_status: 'approved' | 'needs_revision' | 'rejected'
  overall_score: number | null
  checks: Record<string, { passed: boolean; note: string }> | null
  recommendations: string[] | null
  model_used: string | null
  created_at: string
}

interface JobInspectorProps {
  jobId: string | null
  notify: (msg: string, type?: 'success' | 'error') => void
  onJobUpdated: () => void
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_revision: 'bg-yellow-100 text-yellow-700',
}

export default function JobInspector({ jobId, notify, onJobUpdated }: JobInspectorProps) {
  const [job, setJob] = useState<AIJob | null>(null)
  const [verifications, setVerifications] = useState<VerificationLog[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadJob = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/jobs/${jobId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setJob(data.job)
      setVerifications(data.verifications)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load job', 'error')
    } finally {
      setLoading(false)
    }
  }, [jobId, notify])

  useEffect(() => { loadJob() }, [loadJob])

  const action = async (path: string, label: string, body?: object) => {
    if (!jobId) return
    setActionLoading(label)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      notify(`${label} succeeded`)
      await loadJob()
      onJobUpdated()
    } catch (err) {
      notify(err instanceof Error ? err.message : `${label} failed`, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  if (!jobId) {
    return (
      <div className="bg-white rounded-2xl p-12 shadow-sm text-center text-gray-400 text-sm">
        Select a job from the table or generate a new one.
      </div>
    )
  }

  if (loading || !job) {
    return <div className="bg-white rounded-2xl p-6 shadow-sm text-sm text-gray-500">Loading...</div>
  }

  const output = job.output_payload?.content ?? ''
  const canVerify = ['completed', 'pending_review', 'needs_revision'].includes(job.status)
  const canApprove = ['pending_review', 'needs_revision', 'completed'].includes(job.status)

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-[#1A1A2E] truncate">{job.title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {job.job_type} · {job.model_used ?? 'pending'} · ${job.cost_estimate?.toFixed(4) ?? '0.0000'}
          </p>
        </div>
        <span className={`flex-shrink-0 ml-3 text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[job.status] ?? 'bg-gray-100'}`}>
          {job.status}
        </span>
      </div>

      {job.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          {job.error_message}
        </div>
      )}

      {output && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Output</p>
          <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-800 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
            {output}
          </pre>
        </div>
      )}

      <VerificationPanel verifications={verifications} />

      {job.status === 'approved' && (
        <PushToCalendarPanel jobId={job.id} notify={notify} />
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => action(`/api/ai/jobs/${jobId}/verify`, 'Verify')}
          disabled={!canVerify || actionLoading !== null}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#1A1A2E] text-white disabled:opacity-50"
        >
          {actionLoading === 'Verify' ? 'Verifying...' : 'Verify with Claude'}
        </button>
        <button
          onClick={() => action(`/api/ai/jobs/${jobId}/approve`, 'Approve')}
          disabled={!canApprove || actionLoading !== null}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-green-600 text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => {
            const reason = window.prompt('Rejection reason (optional)')
            if (reason !== null) action(`/api/ai/jobs/${jobId}/reject`, 'Reject', { reason: reason || undefined })
          }}
          disabled={actionLoading !== null}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
