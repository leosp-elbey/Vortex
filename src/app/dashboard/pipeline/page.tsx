import { createClient } from '@/lib/supabase/server'
import { daysAgo } from '@/lib/utils'
import type { Opportunity } from '@/types'

const STAGES = [
  { id: 'new-lead', label: 'New Lead', color: 'border-blue-400' },
  { id: 'call-completed', label: 'Call Done', color: 'border-purple-400' },
  { id: 'quote-sent', label: 'Quote Sent', color: 'border-yellow-400' },
  { id: 'follow-up', label: 'Follow Up', color: 'border-orange-400' },
  { id: 'checkout', label: 'Checkout', color: 'border-pink-400' },
  { id: 'member', label: 'Member', color: 'border-green-400' },
] as const

export default async function PipelinePage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('opportunities')
    .select('*, contact:contacts(first_name, last_name, email, source, created_at, last_ai_action)')
    .eq('status', 'open')
    .order('updated_at', { ascending: false })

  const opportunities = (data || []) as Opportunity[]

  const byStage = STAGES.reduce<Record<string, Opportunity[]>>((acc, stage) => {
    acc[stage.id] = opportunities.filter(o => o.stage === stage.id)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#1A1A2E]">Pipeline</h1>
        <p className="text-gray-500">{opportunities.length} open opportunities</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(({ id, label, color }) => {
          const cards = byStage[id] || []
          return (
            <div key={id} className="flex-shrink-0 w-64">
              <div className={`border-t-4 ${color} bg-white rounded-xl shadow-sm`}>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-bold text-[#1A1A2E] text-sm">{label}</h3>
                  <p className="text-xs text-gray-400">{cards.length} contact{cards.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="p-3 space-y-2 min-h-32">
                  {cards.map(opp => (
                    <div key={opp.id} className="bg-gray-50 rounded-lg p-3 text-sm hover:bg-gray-100 transition-colors">
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
                    <p className="text-xs text-gray-300 text-center py-4">Empty</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
