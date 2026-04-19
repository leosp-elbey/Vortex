import { maskKey } from '@/lib/utils'

export default function SettingsPage() {
  const envKeys = [
    { label: 'Supabase URL', key: process.env.NEXT_PUBLIC_SUPABASE_URL, public: true },
    { label: 'Supabase Anon Key', key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, public: true },
    { label: 'Bland.ai API Key', key: process.env.BLAND_API_KEY },
    { label: 'OpenAI API Key', key: process.env.OPENAI_API_KEY },
    { label: 'Resend API Key', key: process.env.RESEND_API_KEY },
  ]

  return (
    <div>
      <h1 className="text-3xl font-black text-[#1A1A2E] mb-2">Settings</h1>
      <p className="text-gray-500 mb-8">API configuration and system status</p>

      {/* API Key Status */}
      <div className="bg-white rounded-xl shadow-sm mb-6">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1A1A2E]">API Keys</h2>
          <p className="text-sm text-gray-500 mt-1">Keys are stored in .env.local and never exposed in source code.</p>
        </div>
        <div className="divide-y divide-gray-100">
          {envKeys.map(({ label, key }) => (
            <div key={label} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-[#1A1A2E]">{label}</p>
              </div>
              <div className="flex items-center gap-3">
                <code className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded font-mono">
                  {key ? maskKey(key) : 'NOT SET'}
                </code>
                <div className={`w-2 h-2 rounded-full ${key ? 'bg-green-500' : 'bg-red-500'}`} />
              </div>
            </div>
          ))}
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
          <div className="flex justify-between"><span className="font-medium">Webhook URL</span><code className="text-xs bg-gray-100 px-2 py-1 rounded">/api/webhooks/bland</code></div>
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
          <div className="flex justify-between"><span className="font-medium">Admin Notifications</span><span>{process.env.ADMIN_NOTIFICATION_EMAIL || 'Not set'}</span></div>
        </div>
      </div>

      {/* Cron */}
      <div className="bg-white rounded-xl shadow-sm">
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
    </div>
  )
}
