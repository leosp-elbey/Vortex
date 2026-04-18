import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils'
import type { AIActionLog } from '@/types'

export default async function CallsPage() {
  const supabase = createClient()

  const { data } = await supabase
    .from('ai_actions_log')
    .select('*, contact:contacts(first_name, last_name, email)')
    .eq('action_type', 'voice-call')
    .order('created_at', { ascending: false })

  const calls = (data || []) as AIActionLog[]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#1A1A2E]">Call Logs</h1>
        <p className="text-gray-500">{calls.length} Bland.ai voice calls</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Contact</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Status</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Duration</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    No calls yet. Submit a lead to trigger the first AI call.
                  </td>
                </tr>
              ) : (
                calls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-[#1A1A2E]">
                      {call.contact ? `${call.contact.first_name} ${call.contact.last_name || ''}` : 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{call.contact?.email || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                        call.status === 'success' ? 'bg-green-100 text-green-700' :
                        call.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {call.duration_ms ? `${(call.duration_ms / 1000).toFixed(0)}s` : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{formatDateTime(call.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
