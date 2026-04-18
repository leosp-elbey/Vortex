export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function daysAgo(dateString: string): number {
  const diff = Date.now() - new Date(dateString).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function classNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '••••••••' + key.slice(-4)
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-800',
    qualified: 'bg-yellow-100 text-yellow-800',
    quoted: 'bg-purple-100 text-purple-800',
    member: 'bg-green-100 text-green-800',
    churned: 'bg-red-100 text-red-800',
    active: 'bg-green-100 text-green-800',
    none: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
    expired: 'bg-orange-100 text-orange-800',
    success: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    draft: 'bg-gray-100 text-gray-800',
    approved: 'bg-blue-100 text-blue-800',
    posted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  }
  return map[status] || 'bg-gray-100 text-gray-800'
}
