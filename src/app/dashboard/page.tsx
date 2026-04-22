import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils'
import type { AIActionLog } from '@/types'
import Link from 'next/link'

async function getStats() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [
    contacts,
    members,
    hotLeads,
    callsToday,
    emailsToday,
    smsToday,
    contentThisWeek,
    recentActivity,
  ] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact', head: true }),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('status', 'member'),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).contains('tags', ['intent:hot']),
    supabase.from('ai_actions_log').select('id', { count: 'exact', head: true }).eq('action_type', 'voice-call').gte('created_at', today),
    supabase.from('ai_actions_log').select('id', { count: 'exact', head: true }).eq('action_type', 'quote-email').gte('created_at', today),
    supabase.from('ai_actions_log').select('id', { count: 'exact', head: true }).eq('service', 'twilio').gte('created_at', today),
    supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'posted').gte('created_at', today.slice(0, 7) + '-01'),
    supabase.from('ai_actions_log').select('*, contact:contacts(first_name, last_name, email)').order('created_at', { ascending: false }).limit(20),
  ])

  return {
    totalLeads: contacts.count ?? 0,
    totalMembers: members.count ?? 0,
    hotLeads: hotLeads.count ?? 0,
    callsToday: callsToday.count ?? 0,
    emailsToday: emailsToday.count ?? 0,
    smsToday: smsToday.count ?? 0,
    contentPosted: contentThisWeek.count ?? 0,
    conversionRate: contacts.count ? ((members.count ?? 0) / contacts.count * 100).toFixed(1) : '0',
    recentActivity: (recentActivity.data ?? []) as AIActionLog[],
  }
}

const actionLabels: Record<string, string> = {
  'voice-call': '📞 Voice Call',
  'quote-email': '📧 Quote Email',
  'onboarding-email': '✉️ Onboarding Email',
  'content-generation': '✍️ Content Generated',
  'admin-notification': '🔔 Admin Notified',
  'sms': '💬 SMS Sent',
  'sequence-email': '📬 Sequence Email',
  'sequence-sms': '💬 Sequence SMS',
}

export default async function DashboardPage() {
  const stats = await getStats()

  const statCards = [
    { label: 'Total Leads', value: stats.totalLeads, icon: '👥', color: 'bg-blue-500', href: '/dashboard/leads' },
    { label: 'Active Members', value: stats.totalMembers, icon: '⭐', color: 'bg-green-500', href: '/dashboard/members' },
    { label: 'Hot Leads', value: stats.hotLeads, icon: '🔥', color: 'bg-red-500', href: '/dashboard/leads' },
    { label: 'Conversion Rate', value: `${stats.conversionRate}%`, icon: '📈', color: 'bg-[#16C79A]', href: '/dashboard/pipeline' },
    { label: 'Calls Today', value: stats.callsToday, icon: '📞', color: 'bg-[#FF6B35]', href: '/dashboard/calls' },
    { label: 'Emails Today', value: stats.emailsToday, icon: '📧', color: 'bg-purple-500', href: '/dashboard/leads' },
    { label: 'SMS Today', value: stats.smsToday, icon: '💬', color: 'bg-indigo-500', href: '/dashboard/leads' },
    { label: 'Posts This Month', value: stats.contentPosted, icon: '📱', color: 'bg-pink-500', href: '/dashboard/content' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-black text-[#1A1A2E]">Dashboard</h1>
        <span className="text-sm text-gray-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </div>
      <p className="text-gray-500 mb-8">Real-time view of your VortexTrips pipeline</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon, color, href }) => (
          <Link key={label} href={href} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center text-xl mb-3`}>
              {icon}
            </div>
            <p className="text-2xl font-black text-[#1A1A2E]">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Generate Content', href: '/dashboard/content', icon: '✨', desc: 'Create this week\'s posts' },
          { label: 'View Pipeline', href: '/dashboard/pipeline', icon: '🔄', desc: 'Drag & drop deals' },
          { label: 'Attribution', href: '/dashboard/attribution', icon: '📡', desc: 'Source analytics' },
          { label: 'Settings', href: '/dashboard/settings', icon: '⚙️', desc: 'Configure automations' },
        ].map(({ label, href, icon, desc }) => (
          <Link key={label} href={href} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md hover:border-[#FF6B35] border-2 border-transparent transition-all flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="font-bold text-[#1A1A2E] text-sm">{label}</p>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Activity feed */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1A1A2E]">Recent AI Activity</h2>
          <span className="text-xs text-gray-400">Last 20 actions</span>
        </div>
        <div className="divide-y divide-gray-100">
          {stats.recentActivity.length === 0 ? (
            <p className="p-6 text-gray-400 text-sm">No activity yet. Submit a lead to get started.</p>
          ) : (
            stats.recentActivity.map((log) => (
              <div key={log.id} className="flex items-center gap-4 p-4 hover:bg-gray-50">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${log.status === 'success' ? 'bg-green-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1A2E]">
                    {actionLabels[log.action_type] || log.action_type}
                    {log.contact && (
                      <span className="text-gray-500 font-normal"> — {log.contact.first_name} {log.contact.last_name}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">{log.service}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    log.status === 'success' ? 'bg-green-100 text-green-700' :
                    log.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {log.status}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(log.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
