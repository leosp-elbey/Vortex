'use client'

import { useState, useEffect } from 'react'
import { daysAgo } from '@/lib/utils'
import type { Opportunity, OpportunityStage } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useToast, Toaster } from '@/components/ui/toast'

const STAGES: { id: OpportunityStage; label: string; color: string }[] = [
  { id: 'new-lead', label: 'New Lead', color: 'border-blue-400' },
  { id: 'call-completed', label: 'Call Done', color: 'border-purple-400' },
  { id: 'quote-sent', label: 'Quote Sent', color: 'border-yellow-400' },
  { id: 'follow-up', label: 'Follow Up', color: 'border-orange-400' },
  { id: 'checkout', label: 'Checkout', color: 'border-pink-400' },
  { id: 'member', label: 'Member', color: 'border-green-400' },
]

export default function PipelinePage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const { toasts, show } = useToast()

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('opportunities')
      .select('*, contact:contacts(first_name, last_name, email, source, created_at, last_ai_action)')
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
      .then(({ data }) => { setOpportunities((data || []) as Opportunity[]); setLoading(false) })
  }, [])

  const byStage = STAGES.reduce<Record<string, Opportunity[]>>((acc, stage) => {
    acc[stage.id] = opportunities.filter(o => o.stage === stage.id)
    return acc
  }, {})

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetStage: OpportunityStage) => {
    e.preventDefault()
    if (!dragId) return

    const opp = opportunities.find(o => o.id === dragId)
    if (!opp || opp.stage === targetStage) { setDragId(null); return }

    setOpportunities(prev =>
      prev.map(o => o.id === dragId ? { ...o, stage: targetStage } : o)
    )
    setDragId(null)

    const res = await fetch('/api/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: dragId, stage: targetStage }),
    })

    if (!res.ok) {
      setOpportunities(prev => prev.map(o => o.id === dragId ? { ...o, stage: opp.stage } : o))
      show('Failed to update stage', 'error')
    } else {
      show(`Moved to ${STAGES.find(s => s.id === targetStage)?.label}`)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#1A1A2E]">Pipeline</h1>
        <p className="text-gray-500">{opportunities.length} open opportunities · Drag cards to move stages</p>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(({ id, color }) => (
            <div key={id} className={`flex-shrink-0 w-64 border-t-4 ${color} bg-white rounded-xl shadow-sm h-48 animate-pulse`} />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(({ id, label, color }) => {
            const cards = byStage[id] || []
            return (
              <div
                key={id}
                className="flex-shrink-0 w-64"
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, id)}
              >
                <div className={`border-t-4 ${color} bg-white rounded-xl shadow-sm`}>
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-bold text-[#1A1A2E] text-sm">{label}</h3>
                    <p className="text-xs text-gray-400">{cards.length} contact{cards.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="p-3 space-y-2 min-h-32">
                    {cards.map(opp => (
                      <div
                        key={opp.id}
                        draggable
                        onDragStart={e => handleDragStart(e, opp.id)}
                        className={`bg-gray-50 rounded-lg p-3 text-sm cursor-grab active:cursor-grabbing hover:bg-gray-100 transition-colors select-none ${
                          dragId === opp.id ? 'opacity-40' : ''
                        }`}
                      >
                        <p className="font-semibold text-[#1A1A2E] truncate">
                          {opp.contact?.first_name} {opp.contact?.last_name || ''}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{opp.contact?.email}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400 capitalize">{opp.contact?.source}</span>
                          <span className="text-xs text-gray-400">
                            {opp.contact?.created_at ? `${daysAgo(opp.contact.created_at)}d ago` : ''}
                          </span>
                        </div>
                        {opp.contact?.last_ai_action && (
                          <p className="text-xs text-[#FF6B35] mt-1 truncate">{opp.contact.last_ai_action}</p>
                        )}
                      </div>
                    ))}
                    {cards.length === 0 && (
                      <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                        <p className="text-xs text-gray-300">Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Toaster toasts={toasts} />
    </div>
  )
}
