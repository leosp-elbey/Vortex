import { createClient } from '@/lib/supabase/server'
import { formatDateTime, getStatusColor } from '@/lib/utils'
import type { Contact } from '@/types'

export default async function LeadsPage() {
  const supabase = createClient()

  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false })

  const leads = (contacts || []) as Contact[]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#1A1A2E]">Leads</h1>
          <p className="text-gray-500">{leads.length} contacts total</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Phone</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Source</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Status</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Tags</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Last Action</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                    No leads yet. Submit your first lead form to get started.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-[#1A1A2E]">
                      {lead.first_name} {lead.last_name || ''}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{lead.email}</td>
                    <td className="px-6 py-4 text-gray-600">{lead.phone || '—'}</td>
                    <td className="px-6 py-4 text-gray-600 capitalize">{lead.source}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(lead.tags || []).map(tag => (
                          <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">{lead.last_ai_action || '—'}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{formatDateTime(lead.created_at)}</td>
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
