// Shared admin-auth helper for AI Command Center routes.
// All /api/ai/* routes call this — returns either a 401/403 NextResponse to short-circuit,
// or the resolved user + admin client when access is granted.

import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface AdminUser {
  id: string
  role: string
}

export type AdminAuthResult =
  | { error: NextResponse }
  | { user: User; adminUser: AdminUser; admin: ReturnType<typeof createAdminClient> }

export async function requireAdminUser(): Promise<AdminAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: adminUser } = await admin
    .from('admin_users')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!adminUser) {
    return { error: NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 }) }
  }

  return { user, adminUser, admin }
}
