'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AIJob {
  id: string
  title: string
  job_type: string
  model_used: string | null
  status: string
  cost_estimate: number | null
  created_at: string
}

interface JobsTableProps {
  selectedJobId: string | null
  onSelect: (jobId: string) => void
  refreshKey: number
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_revision: 'bg-yellow-100 text-yellow-700',
}

export default function JobsTable({ selectedJobId, onSelect, refreshKey }: JobsTableProps) {
  const [jobs, setJobs] = useState<AIJob[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    let query = supabase
      .from('ai_jobs')
      .select('id, title, job_type, model_used, status, cost_estimate, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (typeFilter !== 'all') query = query.eq('job_type', typeFilter)

    const { data } = await query
    setJobs((data ?? []) as AIJob[])
    setLoading(false)
  }, [statusFilter, typeFilter])

  useEffect(() => { loadJobs() }, [loadJobs, refreshKey])

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold text-[#1A1A2E] mr-auto">Recent Jobs</h3>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-300"
        >
          <option value="all">All statuses</option>
          <option value="pending_review">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="needs_revision">Needs revision</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-300"
        >
          <option value="all">All types</option>
          {['ideas','captions','hashtags','outlines','scripts','emails','landing-copy','blog','code','security-review','compliance','social-pack','video-script','email-sequence','social-calendar'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={loadJobs}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-gray-500">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="p-6 text-sm text-gray-500 text-center">No jobs match these filters.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
            <tr>
              <th className="text-left px-6 py-3 font-semibold">Title</th>
              <th className="text-left px-3 py-3 font-semibold">Type</th>
              <th className="text-left px-3 py-3 font-semibold">Model</th>
              <th className="text-left px-3 py-3 font-semibold">Status</th>
              <th className="text-right px-3 py-3 font-semibold">Cost</th>
              <th className="text-right px-6 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => {
              const isSelected = j.id === selectedJobId
              return (
                <tr
                  key={j.id}
                  onClick={() => onSelect(j.id)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-[#FF6B35]/5' : ''}`}
                >
                  <td className="px-6 py-3 font-medium text-[#1A1A2E] truncate max-w-xs">{j.title}</td>
                  <td className="px-3 py-3 text-xs text-gray-600">{j.job_type}</td>
                  <td className="px-3 py-3 text-xs text-gray-600 truncate max-w-[180px]">{j.model_used ?? '—'}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[j.status] ?? 'bg-gray-100'}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-gray-600">${j.cost_estimate?.toFixed(4) ?? '0'}</td>
                  <td className="px-6 py-3 text-right text-xs text-gray-500">{new Date(j.created_at).toLocaleDateString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
