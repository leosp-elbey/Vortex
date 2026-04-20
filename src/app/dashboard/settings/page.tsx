'use client'

import { useState, useEffect } from 'react'
import { maskKey } from '@/lib/utils'
import type { AdminUser } from '@/types'
import { useToast, Toaster } from '@/components/ui/toast'

const ENV_KEYS = [
  { label: 'Supabase URL', name: 'NEXT_PUBLIC_SUPABASE_URL' },
  { label: 'Supabase Anon Key', name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
  { label: 'Bland.ai API Key', name: 'BLAND_API_KEY' },
  { label: 'OpenAI API Key', name: 'OPENAI_API_KEY' },
  { label: 'Resend API Key', name: 'RESEND_API_KEY' },
]

export default function SettingsPage() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const { toasts, show } = useToast()

  useEffect(() => {
    fetch('/api/admin-users')
      .then(r => r.json())
      .then(data => { setAdminUsers(Array.isArray(data) ? data : []); setLoadingAdmins(false) })
      .catch(() => setLoadingAdmins(false))
  }, [])

  const inviteAdmin = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    const res = await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), full_name: inviteName.trim() || undefined }),
    })
    const data = await res.json()
    if (!res.ok) { show(data.error || 'Failed to invite', 'error'); setInviting(false); return }
    setAdminUsers(prev => [data, ...prev])
    setInviteEmail('')
    setInviteName('')
    show(`Invite sent to ${data.email}`)
    setInviting(false)
  }

  const removeAdmin = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from admin access?`)) return
    const res = await fetch(`/api/admin-users?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { show('Failed to remove', 'error'); return }
    setAdminUsers(prev => prev.filter(u => u.id !== id))
    show('Admin removed')
  }

  return (
    <div>
      <h1 className="text-3xl font-black text-[#1A1A2E] mb-2">Settings</h1>
      <p className="text-gray-500 mb-8">API configuration, system status, and team management</p>

      {/* API Key Status */}
      <div className="bg-white rounded-xl shadow-sm mb-6">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1A1A2E]">API Keys</h2>
          <p className="text-sm text-gray-500 mt-1">Keys are stored in environment variables and never exposed in source code.</p>
        </div>
        <div className="divide-y divide-gray-100">
          {ENV_KEYS.map(({ label }) => {
            const key = label === 'Supabase URL' ? process.env.NEXT_PUBLIC_SUPABASE_URL :
              label === 'Supabase Anon Key' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined
            return (
              <div key={label} className="flex items-center justify-between px-6 py-4">
                <p className="text-sm font-medium text-[#1A1A2E]">{label}</p>
                <div className="flex items-center gap-3">
                  <code className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded font-mono">
                    {key ? maskKey(key) : '••••••••••••'}
                  </code>
                  <div className="w-2 h-2 rounded-full bg-green-500" title="Configured in Vercel" />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bland.ai Config */}
      <div className="bg-white rounded-xl shadow-sm mb-6">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1A1A2E]">Bland.ai Voice Configuration</h2>
        </div>
        <div className="p-6 space-y-3 text-sm text-gray-600">
          <div className="flex justify-between"><span className="font-medium">Voice</span><span>Maya</span></div>
          <div className="flex justify-between"><span className="font-medium">Max Duration</span><span>2 minutes</span></div>
          <div className="flex justify-between"><span className="font-medium">Wait for Greeting</span><span>Enabled</span></div>
          <div className="flex justify-between"><span className="font-medium">Voicemail</span><span>Enabled</span></div>
          <div className="flex justify-between">
            <span className="font-medium">Webhook URL</span>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded">/api/webhooks/bland</code>
          </div>
        </div>
      </div>

      {/* Email Config */}
      <div className="bg-white rounded-xl shadow-sm mb-6">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1A1A2E]">Email Configuration</h2>
        </div>
        <div className="p-6 space-y-3 text-sm text-gray-600">
          <div className="flex justify-between"><span className="font-medium">Provider</span><span>Resend</span></div>
          <div className="flex justify-between"><span className="font-medium">From Address</span><span>bookings@vortextrips.com</span></div>
          <div className="flex justify-between">
            <span className="font-medium">Admin Notifications</span>
            <span>{process.env.ADMIN_NOTIFICATION_EMAIL || 'Not set'}</span>
          </div>
        </div>
      </div>

      {/* Scheduled Jobs */}
      <div className="bg-white rounded-xl shadow-sm mb-6">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1A1A2E]">Scheduled Jobs</h2>
        </div>
        <div className="p-6 space-y-3 text-sm text-gray-600">
          <div className="flex justify-between">
            <span className="font-medium">Weekly Content Engine</span>
            <span className="text-green-600 font-semibold">Every Monday 8:00 AM EST</span>
          </div>
          <p className="text-xs text-gray-400">Route: /api/cron/weekly-content — Secured with CRON_SECRET header</p>
        </div>
      </div>

      {/* Admin User Management */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1A1A2E]">Team / Admin Users</h2>
          <p className="text-sm text-gray-500 mt-1">Invite team members with dashboard access. They will receive a setup email.</p>
        </div>

        {/* Invite form */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Full name (optional)"
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              className="flex-1 min-w-40 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
            />
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && inviteAdmin()}
              className="flex-1 min-w-48 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
            />
            <button
              onClick={inviteAdmin}
              disabled={inviting || !inviteEmail.trim()}
              className="bg-[#FF6B35] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#e55a25] transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {inviting ? 'Inviting...' : 'Send Invite'}
            </button>
          </div>
        </div>

        {/* Admin list */}
        <div className="divide-y divide-gray-100">
          {loadingAdmins ? (
            <p className="px-6 py-4 text-sm text-gray-400">Loading...</p>
          ) : adminUsers.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-400">No admin users found.</p>
          ) : (
            adminUsers.map(admin => (
              <div key={admin.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-[#1A1A2E]">{admin.full_name || admin.email}</p>
                  {admin.full_name && <p className="text-xs text-gray-400">{admin.email}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{admin.role}</span>
                  <button
                    onClick={() => removeAdmin(admin.id, admin.email)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Toaster toasts={toasts} />
    </div>
  )
}
