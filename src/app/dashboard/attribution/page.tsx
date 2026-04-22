'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SourceStat {
  source: string
  leads: number
  members: number
  conversion_rate: number
}

interface UtmStat {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  leads: number
}

export default function AttributionPage() {
  const [bySource, setBySource] = useState<SourceStat[]>([])
  const [recentLeads, setRecentLeads] = useState<Array<{
    first_name: string
    email: string
    source: string
    custom_fields: Record<string, string>
    lead_score: number
    created_at: string
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('contacts').select('source, status').not('source', 'is', null),
      supabase.from('contacts').select('first_name, email, source, custom_fields, lead_score, created_at')
        .order('created_at', { ascending: false }).limit(50),
    ]).then(([sourcesRes, recentRes]) => {
      // Aggregate by source
      const raw = sourcesRes.data ?? []
      const map: Record<string, { leads: number; members: number }> = {}
      for (const c of raw) {
        const s = c.source || 'unknown'
        if (!map[s]) map[s] = { leads: 0, members: 0 }
        map[s].leads++
        if (c.status === 'member') map[s].members++
      }
      const stats: SourceStat[] = Object.entries(map)
        .map(([source, { leads, members }]) => ({
          source,
          leads,
          members,
          conversion_rate: leads > 0 ? Math.round((members / leads) * 100) : 0,
        }))
        .sort((a, b) => b.leads - a.leads)

      setBySource(stats)
      setRecentLeads((recentRes.data ?? []) as typeof recentLeads)
      setLoading(false)
    })
  }, [])

  // Aggregate UTM data from custom_fields
  const utmStats: UtmStat[] = (() => {
    const map: Record<string, number> = {}
    for (const c of recentLeads) {
      const f = c.custom_fields ?? {}
      const key = `${f.utm_source ?? '—'}|${f.utm_medium ?? '—'}|${f.utm_campaign ?? '—'}`
      map[key] = (map[key] ?? 0) + 1
    }
    return Object.entries(map)
      .map(([key, leads]) => {
        const [utm_source, utm_medium, utm_campaign] = key.split('|')
        return { utm_source, utm_medium, utm_campaign, leads }
      })
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 10)
  })()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#1A1A2E]">Attribution</h1>
        <p className="text-gray-500">Where your leads come from and which sources convert to members</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-8">

          {/* By source */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">Leads by Source</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 text-gray-500 font-semibold">Source</th>
                    <th className="pb-3 text-gray-500 font-semibold text-right">Leads</th>
                    <th className="pb-3 text-gray-500 font-semibold text-right">Members</th>
                    <th className="pb-3 text-gray-500 font-semibold text-right">Conv. Rate</th>
                    <th className="pb-3 text-gray-500 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {bySource.map(s => (
                    <tr key={s.source} className="border-b last:border-0">
                      <td className="py-3 font-medium text-[#1A1A2E] capitalize">{s.source.replace(/-/g, ' ')}</td>
                      <td className="py-3 text-right">{s.leads}</td>
                      <td className="py-3 text-right text-[#16C79A] font-semibold">{s.members}</td>
                      <td className="py-3 text-right">
                        <span className={`font-semibold ${s.conversion_rate >= 10 ? 'text-[#16C79A]' : s.conversion_rate >= 5 ? 'text-yellow-500' : 'text-gray-400'}`}>
                          {s.conversion_rate}%
                        </span>
                      </td>
                      <td className="py-3 pl-4">
                        <div className="h-2 bg-gray-100 rounded-full w-24">
                          <div className="h-2 bg-[#FF6B35] rounded-full" style={{ width: `${Math.min(s.conversion_rate * 3, 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* UTM breakdown */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">UTM Campaign Breakdown</h2>
            {utmStats.filter(u => u.utm_source !== '—').length === 0 ? (
              <p className="text-gray-400 text-sm">No UTM data yet. Add <code className="bg-gray-100 px-1 rounded">utm_source</code>, <code className="bg-gray-100 px-1 rounded">utm_medium</code>, <code className="bg-gray-100 px-1 rounded">utm_campaign</code> params to your ad links pointing to vortextrips.com.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 text-gray-500 font-semibold">Source</th>
                      <th className="pb-3 text-gray-500 font-semibold">Medium</th>
                      <th className="pb-3 text-gray-500 font-semibold">Campaign</th>
                      <th className="pb-3 text-gray-500 font-semibold text-right">Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {utmStats.map((u, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-3 font-medium">{u.utm_source}</td>
                        <td className="py-3 text-gray-500">{u.utm_medium}</td>
                        <td className="py-3 text-gray-500">{u.utm_campaign}</td>
                        <td className="py-3 text-right font-semibold text-[#FF6B35]">{u.leads}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4">
              Example ad link: <code className="bg-gray-100 px-1 rounded">vortextrips.com/?utm_source=tiktok&utm_medium=paid&utm_campaign=cancun-jan</code>
            </p>
          </div>

          {/* Recent leads with scores */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">Recent Leads — Intent Scores</h2>
            <div className="space-y-2">
              {recentLeads.slice(0, 15).map((c, i) => {
                const score = c.lead_score ?? 0
                const intent = score >= 80 ? 'hot' : score >= 40 ? 'warm' : 'browsing'
                const intentColor = intent === 'hot' ? 'text-red-500 bg-red-50' : intent === 'warm' ? 'text-yellow-600 bg-yellow-50' : 'text-gray-500 bg-gray-100'
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-[#1A1A2E] text-sm">{c.first_name} <span className="text-gray-400 font-normal">· {c.source}</span></p>
                      <p className="text-xs text-gray-400">{c.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${intentColor}`}>{intent}</span>
                      <span className="text-sm font-black text-[#FF6B35]">{score}pts</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
