'use client'

import { useState, useEffect } from 'react'
import { formatDate, formatDateTime, getStatusColor } from '@/lib/utils'
import type { Contact, AIActionLog } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { SlidePanel } from '@/components/ui/slide-panel'
import { useToast, Toaster } from '@/components/ui/toast'

export default function MembersPage() {
  const [members, setMembers] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeMember, setActiveMember] = useState<Contact | null>(null)
  const [memberActions, setMemberActions] = useState<AIActionLog[]>([])
  const [loadingActions, setLoadingActions] = useState(false)
  const { toasts, show } = useToast()

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('contacts')
      .select('*')
      .eq('membership_status', 'active')
      .order('joined_date', { ascending: false })
      .then(({ data }) => { setMembers((data || []) as Contact[]); setLoading(false) })
  }, [])

  const filtered = members.filter(m =>
    !search || `${m.first_name} ${m.last_name || ''} ${m.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const openMember = async (member: Contact) => {
    setActiveMember(member)
    setLoadingActions(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('ai_actions_log')
      .select('*')
      .eq('contact_id', member.id)
      .order('created_at', { ascending: false })
    setMemberActions((data || []) as AIActionLog[])
    setLoadingActions(false)
  }

  const actionLabel: Record<string, string> = {
    'voice-call': 'Voice Call',
    'quote-email': 'Quote Email',
    'content-generation': 'Content Generated',
    'onboarding-email': 'Onboarding Email',
    'admin-notification': 'Admin Notified',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#1A1A2E]">Members</h1>
          <p className="text-gray-500">{members.length} active Travel Team Perks members</p>
        </div>
        <div className="bg-[#16C79A]/10 text-[#16C79A] font-bold px-4 py-2 rounded-lg text-sm">
          {members.length} Active
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search members..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Phone</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Joined</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Membership</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Last Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    {search ? 'No members match your search.' : 'No members yet. Share your join page to get your first paying member.'}
                  </td>
                </tr>
              ) : (
                filtered.map((member) => (
                  <tr
                    key={member.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => openMember(member)}
                  >
                    <td className="px-6 py-4 font-medium text-[#1A1A2E]">
                      {member.first_name} {member.last_name || ''}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{member.email}</td>
                    <td className="px-6 py-4 text-gray-600">{member.phone || '—'}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {member.joined_date ? formatDate(member.joined_date) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-semibold">
                        {member.membership_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{member.last_ai_action || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member detail panel */}
      <SlidePanel
        open={!!activeMember}
        onClose={() => setActiveMember(null)}
        title={activeMember ? `${activeMember.first_name} ${activeMember.last_name || ''}` : ''}
      >
        {activeMember && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Member Info</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-gray-400 text-xs">Email</p><p className="font-medium text-[#1A1A2E]">{activeMember.email}</p></div>
                <div><p className="text-gray-400 text-xs">Phone</p><p className="font-medium text-[#1A1A2E]">{activeMember.phone || '—'}</p></div>
                <div><p className="text-gray-400 text-xs">Joined</p><p className="font-medium text-[#1A1A2E]">{activeMember.joined_date ? formatDate(activeMember.joined_date) : '—'}</p></div>
                <div><p className="text-gray-400 text-xs">Source</p><p className="font-medium text-[#1A1A2E] capitalize">{activeMember.source || '—'}</p></div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Membership Status</h3>
              <span className={`inline-block text-xs px-3 py-1.5 rounded-full font-medium ${getStatusColor(activeMember.membership_status)}`}>
                {activeMember.membership_status}
              </span>
            </div>

            {(activeMember.tags || []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {activeMember.tags.map(tag => (
                    <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">AI Action History</h3>
              {loadingActions ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : memberActions.length === 0 ? (
                <p className="text-sm text-gray-400">No actions yet.</p>
              ) : (
                <div className="space-y-2">
                  {memberActions.map(action => (
                    <div key={action.id} className="flex items-start gap-3 text-sm">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        action.status === 'success' ? 'bg-green-500' :
                        action.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#1A1A2E]">{actionLabel[action.action_type] || action.action_type}</p>
                        <p className="text-xs text-gray-400">{action.service} · {formatDateTime(action.created_at)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${getStatusColor(action.status)}`}>
                        {action.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlidePanel>

      <Toaster toasts={toasts} />
    </div>
  )
}
