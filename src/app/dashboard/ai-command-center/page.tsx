'use client'

import { useState } from 'react'
import { useToast, Toaster } from '@/components/ui/toast'
import WorkflowPanel from '@/components/ai/WorkflowPanel'
import JobInspector from '@/components/ai/JobInspector'
import JobsTable from '@/components/ai/JobsTable'

export default function AICommandCenterPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { toasts, show: notify } = useToast()

  const handleJobCreated = (jobId: string) => {
    setSelectedJobId(jobId)
    setRefreshKey(k => k + 1)
  }

  const handleJobUpdated = () => {
    setRefreshKey(k => k + 1)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#1A1A2E]">🤖 AI Command Center</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate, verify, and approve AI content. All requests routed through OpenRouter; output reviewed by Claude before approval.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <WorkflowPanel onJobCreated={handleJobCreated} notify={notify} />
        <JobInspector jobId={selectedJobId} notify={notify} onJobUpdated={handleJobUpdated} />
      </div>

      <JobsTable
        selectedJobId={selectedJobId}
        onSelect={setSelectedJobId}
        refreshKey={refreshKey}
      />

      <Toaster toasts={toasts} />
    </div>
  )
}
