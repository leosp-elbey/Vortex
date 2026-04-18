import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { Contact } from '@/types'

export default async function MembersPage() {
  const supabase = createClient()

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('membership_status', 'active')
    .order('joined_date', { ascending: false })

  const members = (data || []) as Contact[]

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
              {members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    No members yet. Share your join page to get your first paying member.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
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
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {member.last_ai_action || '—'}
                    </td>
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
