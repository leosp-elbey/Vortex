'use client'

interface CheckResult {
  passed: boolean
  note: string
}

interface VerificationLog {
  id: string
  verification_status: 'approved' | 'needs_revision' | 'rejected'
  overall_score: number | null
  checks: Record<string, CheckResult> | null
  recommendations: string[] | null
  model_used: string | null
  created_at: string
}

interface VerificationPanelProps {
  verifications: VerificationLog[]
}

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  needs_revision: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function VerificationPanel({ verifications }: VerificationPanelProps) {
  if (verifications.length === 0) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-500 text-center">
        No verification yet. Click <strong>Verify with Claude</strong> to review this output.
      </div>
    )
  }

  const latest = verifications[0]
  const checks = latest.checks ?? {}
  const recs = latest.recommendations ?? []

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">Verification</span>
        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[latest.verification_status]}`}>
          {latest.verification_status} {latest.overall_score !== null && `· ${latest.overall_score}/100`}
        </span>
      </div>

      <div className="space-y-1.5">
        {Object.entries(checks).map(([name, result]) => (
          <div key={name} className="flex items-start gap-2 text-xs">
            <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${result.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {result.passed ? '✓' : '✕'}
            </span>
            <div className="flex-1">
              <strong className="text-[#1A1A2E]">{name.replace(/_/g, ' ')}</strong>
              {result.note && <span className="text-gray-500"> — {result.note}</span>}
            </div>
          </div>
        ))}
      </div>

      {recs.length > 0 && (
        <div className="pt-2 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-600 mb-1">Recommendations</p>
          <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
            {recs.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-gray-400">
        Verified by {latest.model_used ?? 'claude'} · {new Date(latest.created_at).toLocaleString()}
      </p>
    </div>
  )
}
