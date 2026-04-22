'use client'

import { useState, useEffect } from 'react'
import { formatDateTime, getStatusColor } from '@/lib/utils'
import type { Contact, AIActionLog, ContactStatus } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { SlidePanel } from '@/components/ui/slide-panel'
import { useToast, Toaster } from '@/components/ui/toast'

const STATUS_OPTIONS: ContactStatus[] = ['lead', 'qualified', 'quoted', 'member', 'churned']

const SOURCE_OPTIONS = [
  'landing-page', 'quiz', 'referral', 'facebook', 'instagram',
  'tiktok', 'google', 'sba', 'partner', 'manual', 'other',
]

const BLANK_FORM = {
  first_name: '', last_name: '', email: '', phone: '',
  source: 'manual', status: 'lead' as ContactStatus,
  destination: '', notes: '', enroll_sequence: false,
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<ContactStatus>('qualified')
  const [bulkTag, setBulkTag] = useState('')
  const [activeContact, setActiveContact] = useState<Contact | null>(null)
  const [contactActions, setContactActions] = useState<AIActionLog[]>([])
  const [loadingActions, setLoadingActions] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState(BLANK_FORM)
  const [addLoading, setAddLoading] = useState(false)
  const { toasts, show } = useToast()

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLeads((data || []) as Contact[]); setLoading(false) })
  }, [])

  const filtered = leads.filter(l => {
    const matchSearch = !search ||
      `${l.first_name} ${l.last_name || ''} ${l.email}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || l.status === statusFilter
    return matchSearch && matchStatus
  })

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id)))
  }

  const applyBulkStatus = async () => {
    const ids = Array.from(selected)
    await Promise.all(ids.map(id =>
      fetch('/api/contacts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: bulkStatus }) })
    ))
    setLeads(prev => prev.map(l => selected.has(l.id) ? { ...l, status: bulkStatus } : l))
    setSelected(new Set())
    show(`Updated ${ids.length} contact${ids.length !== 1 ? 's' : ''} to ${bulkStatus}`)
  }

  const applyBulkTag = async () => {
    if (!bulkTag.trim()) return
    const tag = bulkTag.trim().toLowerCase().replace(/\s+/g, '-')
    const ids = Array.from(selected)
    const targets = leads.filter(l => selected.has(l.id))
    await Promise.all(targets.map(l =>
      fetch('/api/contacts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: l.id, tags: Array.from(new Set([...(l.tags || []), tag])) })
      })
    ))
    setLeads(prev => prev.map(l =>
      selected.has(l.id) ? { ...l, tags: Array.from(new Set([...(l.tags || []), tag])) } : l
    ))
    setSelected(new Set())
    setBulkTag('')
    show(`Tag "${tag}" added to ${ids.length} contact${ids.length !== 1 ? 's' : ''}`)
  }

  const openContact = async (contact: Contact) => {
    setActiveContact(contact)
    setLoadingActions(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('ai_actions_log')
      .select('*')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false })
    setContactActions((data || []) as AIActionLog[])
    setLoadingActions(false)
  }

  const updateContactStatus = async (id: string, status: ContactStatus) => {
    const res = await fetch('/api/contacts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    })
    if (!res.ok) { show('Failed to update', 'error'); return }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    if (activeContact?.id === id) setActiveContact(prev => prev ? { ...prev, status } : null)
    show('Status updated')
  }

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddLoading(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add lead')
      setLeads(prev => [data as Contact, ...prev])
      setAddForm(BLANK_FORM)
      setShowAddModal(false)
      show(`${addForm.first_name} added successfully${addForm.enroll_sequence ? ' — enrolled in nurture sequence' : ''}`)
    } catch (err) {
      show(err instanceof Error ? err.message : 'Failed to add lead', 'error')
    } finally {
      setAddLoading(false)
    }
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
          <h1 className="text-3xl font-black text-[#1A1A2E]">Leads</h1>
          <p className="text-gray-500">{leads.length} contacts total</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-[#FF6B35] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#e55a25] transition-colors flex items-center gap-2"
        >
          + Add Lead
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-[#1A1A2E] text-white rounded-xl px-5 py-3 mb-4 flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <select
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value as ContactStatus)}
              className="text-sm bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s} className="text-black">{s}</option>)}
            </select>
            <button
              onClick={applyBulkStatus}
              className="text-sm bg-[#FF6B35] px-3 py-1.5 rounded-lg font-medium hover:bg-[#e55a25] transition-colors"
            >
              Set Status
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Add tag..."
              value={bulkTag}
              onChange={e => setBulkTag(e.target.value)}
              className="text-sm bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white placeholder-white/50 w-32"
            />
            <button
              onClick={applyBulkTag}
              className="text-sm bg-white/20 px-3 py-1.5 rounded-lg font-medium hover:bg-white/30 transition-colors"
            >
              Add Tag
            </button>
          </div>
          <button onClick={() => setSelected(new Set())} className="text-sm text-white/60 hover:text-white ml-auto">
            Clear
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-4 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-4 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-4 font-semibold text-gray-600">Phone</th>
                <th className="text-left px-4 py-4 font-semibold text-gray-600">Source</th>
                <th className="text-left px-4 py-4 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-4 font-semibold text-gray-600">Tags</th>
                <th className="text-left px-4 py-4 font-semibold text-gray-600">Last Action</th>
                <th className="text-left px-4 py-4 font-semibold text-gray-600">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">No leads found.</td></tr>
              ) : (
                filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLInputElement).type === 'checkbox') return
                      openContact(lead)
                    }}
                  >
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-4 font-medium text-[#1A1A2E]">
                      {lead.first_name} {lead.last_name || ''}
                    </td>
                    <td className="px-4 py-4 text-gray-600">{lead.email}</td>
                    <td className="px-4 py-4 text-gray-600">{lead.phone || '—'}</td>
                    <td className="px-4 py-4 text-gray-600 capitalize">{lead.source}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(lead.tags || []).map(tag => (
                          <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 text-xs">{lead.last_ai_action || '—'}</td>
                    <td className="px-4 py-4 text-gray-400 text-xs">{formatDateTime(lead.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contact detail panel */}
      <SlidePanel
        open={!!activeContact}
        onClose={() => setActiveContact(null)}
        title={activeContact ? `${activeContact.first_name} ${activeContact.last_name || ''}` : ''}
      >
        {activeContact && (
          <div className="space-y-6">
            {/* Contact info */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Contact Info</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-gray-400 text-xs">Email</p><p className="font-medium text-[#1A1A2E]">{activeContact.email}</p></div>
                <div><p className="text-gray-400 text-xs">Phone</p><p className="font-medium text-[#1A1A2E]">{activeContact.phone || '—'}</p></div>
                <div><p className="text-gray-400 text-xs">Source</p><p className="font-medium text-[#1A1A2E] capitalize">{activeContact.source}</p></div>
                <div><p className="text-gray-400 text-xs">Created</p><p className="font-medium text-[#1A1A2E]">{formatDateTime(activeContact.created_at)}</p></div>
              </div>
            </div>

            {/* Status change */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Status</h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => updateContactStatus(activeContact.id, s)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                      activeContact.status === s
                        ? getStatusColor(s) + ' border-transparent'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            {(activeContact.tags || []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {activeContact.tags.map(tag => (
                    <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Action history */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">AI Action History</h3>
              {loadingActions ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : contactActions.length === 0 ? (
                <p className="text-sm text-gray-400">No actions yet.</p>
              ) : (
                <div className="space-y-2">
                  {contactActions.map(action => (
                    <div key={action.id} className="flex items-start gap-3 text-sm">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        action.status === 'success' ? 'bg-green-500' :
                        action.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#1A1A2E]">{actionLabel[action.action_type] || action.action_type}</p>
                        <p className="text-xs text-gray-400">{action.service} · {formatDateTime(action.created_at)}</p>
                        {action.error_message && (
                          <p className="text-xs text-red-500 mt-0.5">{action.error_message}</p>
                        )}
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

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-xl font-black text-[#1A1A2E]">Add Existing Lead</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleAddLead} className="p-6 space-y-4">
              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">First Name <span className="text-red-500">*</span></label>
                  <input
                    type="text" required autoComplete="off"
                    value={addForm.first_name}
                    onChange={e => setAddForm(f => ({ ...f, first_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Last Name</label>
                  <input
                    type="text" autoComplete="off"
                    value={addForm.last_name}
                    onChange={e => setAddForm(f => ({ ...f, last_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                    placeholder="Smith"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Email <span className="text-red-500">*</span></label>
                <input
                  type="email" required autoComplete="off"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                  placeholder="jane@email.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
                <input
                  type="tel" autoComplete="off"
                  value={addForm.phone}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                  placeholder="+1 555 000 0000"
                />
              </div>

              {/* Source + Status row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Source</label>
                  <select
                    value={addForm.source}
                    onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white"
                  >
                    {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                  <select
                    value={addForm.status}
                    onChange={e => setAddForm(f => ({ ...f, status: e.target.value as ContactStatus }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white"
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Destination interest */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Destination Interest</label>
                <input
                  type="text" autoComplete="off"
                  value={addForm.destination}
                  onChange={e => setAddForm(f => ({ ...f, destination: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30"
                  placeholder="Cancún, Paris, Vegas..."
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 resize-none"
                  placeholder="Any context about this lead..."
                />
              </div>

              {/* Enroll in sequence */}
              <label className="flex items-start gap-3 cursor-pointer bg-[#FF6B35]/5 border border-[#FF6B35]/20 rounded-xl p-4">
                <input
                  type="checkbox"
                  checked={addForm.enroll_sequence}
                  onChange={e => setAddForm(f => ({ ...f, enroll_sequence: e.target.checked }))}
                  className="mt-0.5 accent-[#FF6B35]"
                />
                <div>
                  <p className="text-sm font-semibold text-[#1A1A2E]">Enroll in 14-day nurture sequence</p>
                  <p className="text-xs text-gray-500 mt-0.5">Schedules the full email + SMS drip starting tomorrow. Only check if the lead hasn&apos;t already been contacted.</p>
                </div>
              </label>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 px-4 py-2.5 bg-[#FF6B35] text-white rounded-lg text-sm font-semibold hover:bg-[#e55a25] transition-colors disabled:opacity-60"
                >
                  {addLoading ? 'Adding...' : 'Add Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toaster toasts={toasts} />
    </div>
  )
}
