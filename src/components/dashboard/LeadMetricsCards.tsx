// Phase LE-1 — dashboard lead-engine metric cards.
'use client'

import { useEffect, useState } from 'react'

interface Metrics {
  target_daily_qualified: number
  leads_today: number
  qualified_today: number
  booked_today: number
  joins_today: number
  trend_7d: Record<string, number>
  by_channel: Record<string, number>
}

function Card({ label, value, target }: { label: string; value: number; target?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black text-[#1A1A2E] mt-1">
        {value}
        {target ? <span className="text-sm font-medium text-gray-400"> / {target}</span> : null}
      </p>
    </div>
  )
}

export default function LeadMetricsCards() {
  const [m, setM] = useState<Metrics | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/lead-metrics', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setM)
      .catch(() => setM(null))
  }, [])

  if (!m) return null
  const maxTrend = Math.max(1, ...Object.values(m.trend_7d))

  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Leads today" value={m.leads_today} target={m.target_daily_qualified} />
        <Card label="Qualified today" value={m.qualified_today} target={m.target_daily_qualified} />
        <Card label="Booked today" value={m.booked_today} />
        <Card label="Joins today" value={m.joins_today} />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">7-day lead trend</p>
        <div className="flex items-end gap-2 h-20">
          {Object.entries(m.trend_7d).map(([day, n]) => (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-[#FF6B35] rounded-t"
                style={{ height: `${(n / maxTrend) * 100}%` }}
                title={`${day}: ${n}`}
              />
              <span className="text-[10px] text-gray-400">{day.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Leads by channel (30d)</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(m.by_channel)
            .sort((a, b) => b[1] - a[1])
            .map(([ch, n]) => (
              <span key={ch} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                {ch}: {n}
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}
