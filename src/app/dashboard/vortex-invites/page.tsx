'use client'

// Phase 22F — Vortex invite queue dashboard.
//
// Shows daily-cron staging status + a workflow for the operator to:
//   1. Click "Prepare batch" — fetches pending queue items as Surge365
//      SendEmails payload JSON (copy-paste into the Claude in Chrome
//      automation).
//   2. After the automation pushes the batch, click "Mark batch as sent"
//      to flip queue.status pending → sent.
//
// Email addresses in the table are partially masked (first 3 chars + ****
// + domain) to keep the dashboard PII-light while still being useful.

import { useEffect, useState, useCallback } from 'react'

interface QueueRow {
  id: string
  contact_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  status: string
  queued_at: string
  sent_at: string | null
}

interface Counts {
  contactsNotInvited: number
  pendingInQueue: number
  sentToday: number
}

interface PreparedBatch {
  count: number
  people: Array<{ EmailAddress: string; FirstName: string; LastName: string }>
  queueIds: string[]
  surge365PayloadHint: string
}

function maskEmail(email: string | null): string {
  if (!email) return '(no email)'
  const at = email.indexOf('@')
  if (at < 0) return email.slice(0, 3) + '****'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  const visible = local.slice(0, 3)
  return `${visible}****${domain}`
}

export default function VortexInvitesPage() {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [pendingItems, setPendingItems] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [batch, setBatch] = useState<PreparedBatch | null>(null)
  const [busy, setBusy] = useState<'prepare' | 'mark-sent' | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/vortex-invites', { cache: 'no-store' })
      if (!res.ok) throw new Error(`GET failed (${res.status})`)
      const data = await res.json()
      setCounts(data.counts)
      setPendingItems(data.pendingItems ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function prepareBatch() {
    setBusy('prepare')
    setError(null)
    try {
      const res = await fetch('/api/admin/vortex-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare' }),
      })
      if (!res.ok) throw new Error(`prepare failed (${res.status})`)
      const data = (await res.json()) as PreparedBatch
      setBatch(data)
      if (!data.count) setToast('Queue is empty — nothing to send.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'prepare failed')
    } finally {
      setBusy(null)
    }
  }

  async function markBatchSent() {
    if (!batch || !batch.queueIds.length) return
    setBusy('mark-sent')
    setError(null)
    try {
      const res = await fetch('/api/admin/vortex-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-sent', ids: batch.queueIds }),
      })
      if (!res.ok) throw new Error(`mark-sent failed (${res.status})`)
      const data = await res.json()
      setToast(`Marked ${data.marked} queue rows as sent.`)
      setBatch(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'mark-sent failed')
    } finally {
      setBusy(null)
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => setToast('Copied to clipboard'),
      () => setToast('Copy failed — select and copy manually'),
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#1A1A2E]">📧 Vortex Invites</h1>
          <p className="text-sm text-gray-500 mt-1">
            Daily cron at 09:30 UTC stages 50 contacts into the queue. The Send Pending Invites
            button below prepares the Surge365 SendEmails payload for the Claude in Chrome
            automation.
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm font-semibold text-[#1A1A2E] underline"
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {toast && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {toast}
          <button onClick={() => setToast(null)} className="ml-3 underline">dismiss</button>
        </div>
      )}

      {/* Counts cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Not yet invited</div>
          <div className="text-3xl font-black text-[#1A1A2E] mt-1">{counts?.contactsNotInvited ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-1">leads eligible for the next cron tick</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Pending in queue</div>
          <div className="text-3xl font-black text-orange-600 mt-1">{counts?.pendingInQueue ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-1">awaiting Claude in Chrome push</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500">Sent today (UTC)</div>
          <div className="text-3xl font-black text-emerald-600 mt-1">{counts?.sentToday ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-1">queue rows flipped pending → sent today</div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={prepareBatch}
          disabled={busy !== null || (counts?.pendingInQueue ?? 0) === 0}
          className="rounded-lg bg-[#FF6B35] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy === 'prepare' ? 'Preparing…' : 'Send Pending Invites (prepare batch)'}
        </button>
        {batch && batch.queueIds.length > 0 && (
          <button
            onClick={markBatchSent}
            disabled={busy !== null}
            className="rounded-lg border border-emerald-600 bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-700 disabled:opacity-50"
          >
            {busy === 'mark-sent' ? 'Marking…' : `Mark batch as sent (${batch.queueIds.length})`}
          </button>
        )}
      </div>

      {/* Prepared batch payload */}
      {batch && batch.count > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[#1A1A2E]">
                Surge365 SendEmails payload — {batch.count} contacts
              </div>
              <div className="text-xs text-gray-500 mt-1">{batch.surge365PayloadHint}</div>
            </div>
            <button
              onClick={() => copyToClipboard(JSON.stringify(batch.people))}
              className="text-xs font-semibold text-[#1A1A2E] underline"
            >
              Copy people JSON
            </button>
          </div>
          <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto max-h-64">
{JSON.stringify(batch.people, null, 2)}
          </pre>
        </div>
      )}

      {/* Pending queue table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm font-bold text-[#1A1A2E]">Current pending queue</div>
          <div className="text-xs text-gray-500">{pendingItems.length} rows</div>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-gray-500">Loading…</div>
        ) : pendingItems.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-500">
            No pending invites. The next cron tick (09:30 UTC) will stage another batch.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-5 py-2">First name</th>
                <th className="text-left px-5 py-2">Email (masked)</th>
                <th className="text-left px-5 py-2">Status</th>
                <th className="text-left px-5 py-2">Queued at (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-5 py-2">{row.first_name || '—'}</td>
                  <td className="px-5 py-2 font-mono text-xs">{maskEmail(row.email)}</td>
                  <td className="px-5 py-2">
                    <span className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-gray-500 text-xs">
                    {new Date(row.queued_at).toISOString().replace('T', ' ').slice(0, 19)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
