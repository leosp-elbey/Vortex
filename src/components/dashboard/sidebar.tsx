'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/leads', label: 'Leads', icon: '👥' },
  { href: '/dashboard/members', label: 'Members', icon: '⭐' },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: '🔄' },
  { href: '/dashboard/calls', label: 'Calls', icon: '📞' },
  { href: '/dashboard/content', label: 'Content', icon: '✍️' },
  { href: '/dashboard/attribution', label: 'Attribution', icon: '📡' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 bg-[#1A1A2E] text-white flex flex-col h-full flex-shrink-0">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-black">Vortex<span className="text-[#FF6B35]">Trips</span></h1>
        <p className="text-xs text-gray-400 mt-1">Admin Dashboard</p>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#FF6B35] text-white'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
