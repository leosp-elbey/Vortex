#!/usr/bin/env node
// scripts/cleanup-bounces.mjs
// Phase 22B — bounce-list reconciliation between Supabase contacts,
// pending sequence_queue rows, and the Resend suppression list.
//
// SCHEMA CORRECTED: uses contacts.status (single column) per migrations
// 041_widen_contacts_status_check + 042_widen_sequence_queue_status, not
// the non-existent email_status / email_bounce_count / sequence_status columns.
//
// NOTE: sequence_queue has NO updated_at column — TASK 2 PATCH omits it.
//
// Run from repo root:
//   node scripts/cleanup-bounces.mjs            # writes
//   node scripts/cleanup-bounces.mjs --dry-run  # preview only

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env.local');
const DRY_RUN = process.argv.includes('--dry-run');
const SUPPRESSED_STATUSES = ['bounced', 'unsubscribed', 'rejected'];

// ---------- env loading (no echo) ----------
function loadEnv(path) {
  const txt = readFileSync(path, 'utf8').replace(/\r/g, '');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv(ENV_PATH);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = env.RESEND_API_KEY;

if (!SUPA_URL || !SUPA_KEY || !RESEND_KEY) {
  console.error('Missing one of NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY in .env.local');
  process.exit(1);
}

const supaHeaders = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function supaSelect(table, qs) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs}`, { headers: supaHeaders });
  if (!r.ok) throw new Error(`Supabase SELECT ${table} failed (${r.status}): ${await r.text()}`);
  return r.json();
}

async function supaPatch(table, filter, body) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] would PATCH ${table}?${filter} → ${JSON.stringify(body)}`);
    return [];
  }
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: supaHeaders,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${table} failed (${r.status}): ${await r.text()}`);
  return r.json();
}

async function supaCount(table, qs) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs}&select=id`, {
    headers: { ...supaHeaders, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!r.ok) throw new Error(`Supabase COUNT ${table} failed (${r.status}): ${await r.text()}`);
  const cr = r.headers.get('content-range') || '';
  const total = cr.split('/')[1];
  return Number.parseInt(total, 10);
}

// ---------- TASK 1 ----------
// SELECT id, email, first_name, status, updated_at
// FROM contacts
// WHERE status IN ('bounced', 'unsubscribed', 'rejected')
// ORDER BY updated_at DESC
// LIMIT 50;
async function task1() {
  console.log('\n========== TASK 1: Bounced / unsubscribed / rejected contacts (top 50 by updated_at desc) ==========');
  const qs = new URLSearchParams({
    select: 'id,email,first_name,status,updated_at',
    status: `in.(${SUPPRESSED_STATUSES.join(',')})`,
    order: 'updated_at.desc',
    limit: '50',
  }).toString();
  const rows = await supaSelect('contacts', qs);
  console.log(`Rows returned: ${rows.length}`);
  console.log('---');
  for (const r of rows) {
    console.log(`${r.id} | ${r.email} | ${r.first_name ?? ''} | status=${r.status} | updated=${r.updated_at}`);
  }
  return rows;
}

// ---------- TASK 2 ----------
// UPDATE sequence_queue
// SET status = 'cancelled'
// WHERE contact_id IN (
//   SELECT id FROM contacts WHERE status IN ('bounced','unsubscribed','rejected')
// )
// AND status = 'pending'
// RETURNING id;
// Note: sequence_queue table has no updated_at column — omitted intentionally.
async function task2() {
  console.log('\n========== TASK 2: Cancel pending sequence_queue rows for suppressed contacts ==========');
  // Step 1: get the FULL set of suppressed contact IDs (not just the 50 from TASK 1)
  const idQs = new URLSearchParams({
    select: 'id',
    status: `in.(${SUPPRESSED_STATUSES.join(',')})`,
  }).toString();
  const suppressed = await supaSelect('contacts', idQs);
  const ids = suppressed.map(r => r.id);
  console.log(`Suppressed contacts in DB: ${ids.length}`);
  if (!ids.length) {
    console.log('Rows cancelled: 0');
    return 0;
  }
  // Step 2: cancel pending sequence_queue rows for those contacts.
  // PostgREST has a limit on URL length when contact_id IN is long — chunk it.
  const CHUNK = 200;
  let cancelled = 0;
  const cancelledIds = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const filter = new URLSearchParams({
      contact_id: `in.(${chunk.join(',')})`,
      status: 'eq.pending',
    }).toString();
    const res = await supaPatch('sequence_queue', filter, {
      status: 'cancelled',
    });
    cancelled += res.length;
    for (const r of res) cancelledIds.push(r.id);
  }
  console.log(`Rows cancelled: ${cancelled}`);
  if (cancelledIds.length && cancelledIds.length <= 50) {
    console.log('Cancelled queue row IDs:', cancelledIds.join(', '));
  } else if (cancelledIds.length) {
    console.log('Cancelled queue row IDs (first 50):', cancelledIds.slice(0, 50).join(', '));
  }
  return cancelled;
}

// ---------- TASK 3 ----------
// GET https://api.resend.com/suppressions
// For each email on Resend list that exists in contacts but is not in
// SUPPRESSED_STATUSES, UPDATE contacts SET status='bounced'.
async function task3() {
  console.log('\n========== TASK 3: Resend suppression list reconciliation ==========');
  let suppressions = [];
  let endpointUsed = null;
  const candidates = [
    'https://api.resend.com/suppressions',
    'https://api.resend.com/emails/suppressions',
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${RESEND_KEY}` } });
      if (r.ok) {
        const body = await r.json();
        const arr = Array.isArray(body) ? body : (body.data || body.suppressions || []);
        if (Array.isArray(arr)) {
          suppressions = arr;
          endpointUsed = url;
          break;
        }
      } else {
        console.log(`  ${url} → ${r.status}`);
      }
    } catch (e) {
      console.log(`  ${url} → error: ${e.message}`);
    }
  }
  console.log(`Resend endpoint used: ${endpointUsed ?? '(none worked)'}`);
  console.log(`Resend suppression list size: ${suppressions.length}`);
  const resendEmails = [];
  for (const s of suppressions) {
    const email = (s.email || s.emailAddress || s.address || '').toLowerCase().trim();
    const reason = s.reason || s.type || s.event || '';
    console.log(`  - ${email}${reason ? ` (${reason})` : ''}`);
    if (email) resendEmails.push(email);
  }
  if (!resendEmails.length) {
    console.log('Nothing to reconcile.');
    return { resendListSize: 0, contactsReconciled: 0 };
  }

  // Look up which of those emails exist in contacts and don't already have a suppressed status
  const CHUNK = 100;
  const toUpdate = [];
  for (let i = 0; i < resendEmails.length; i += CHUNK) {
    const chunk = resendEmails.slice(i, i + CHUNK);
    const qs = new URLSearchParams({
      select: 'id,email,status',
      email: `in.(${chunk.map(e => `"${e}"`).join(',')})`,
    }).toString();
    const found = await supaSelect('contacts', qs);
    for (const c of found) {
      if (!SUPPRESSED_STATUSES.includes(c.status)) toUpdate.push(c);
    }
  }
  console.log(`Contacts to reconcile (in Resend list but not yet suppressed in DB): ${toUpdate.length}`);
  for (const c of toUpdate) {
    console.log(`  - ${c.email} (was status=${c.status}) → bounced`);
  }
  let updated = 0;
  for (const c of toUpdate) {
    const filter = new URLSearchParams({
      email: `eq.${c.email}`,
    }).toString();
    const res = await supaPatch('contacts', filter, {
      status: 'bounced',
      updated_at: new Date().toISOString(),
    });
    updated += res.length;
  }
  console.log(`Contacts updated to status='bounced' from Resend list: ${updated}`);
  return { resendListSize: suppressions.length, contactsReconciled: updated };
}

// ---------- TASK 4 ----------
// SELECT status, count(*) FROM contacts GROUP BY status ORDER BY count DESC;
// SELECT count(*) FROM sequence_queue WHERE status = 'cancelled';
async function task4() {
  console.log('\n========== TASK 4: Final counts ==========');
  const knownStatuses = [
    'lead', 'qualified', 'quoted', 'member', 'churned',
    'unsubscribed', 'bounced', 'rejected',
  ];
  console.log('contacts.status counts:');
  const tallies = [];
  for (const s of knownStatuses) {
    const qs = new URLSearchParams({ status: `eq.${s}` }).toString();
    const n = await supaCount('contacts', qs);
    tallies.push([s, n]);
  }
  const knownQs = new URLSearchParams({
    status: `not.in.(${knownStatuses.join(',')})`,
  }).toString();
  const unknown = await supaCount('contacts', knownQs);
  if (unknown) tallies.push(['(other / null)', unknown]);
  tallies.sort((a, b) => b[1] - a[1]);
  for (const [s, n] of tallies) console.log(`  ${s.padEnd(20)} ${n}`);

  const totalCancelled = await supaCount('sequence_queue', 'status=eq.cancelled');
  console.log(`\nsequence_queue rows with status='cancelled': ${totalCancelled}`);
  return { tallies, totalCancelled };
}

// ---------- main ----------
(async () => {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'EXECUTE (writes will be performed)'}`);
  console.log(`Supabase URL: ${SUPA_URL}`);
  try {
    const t1Rows = await task1();
    const t2Cancelled = await task2();
    const t3 = await task3();
    const t4 = await task4();
    console.log('\n========== SUMMARY ==========');
    console.log(`TASK 1 — bounced/unsubscribed/rejected contacts shown:  ${t1Rows.length}`);
    console.log(`TASK 2 — sequence_queue rows cancelled:                ${t2Cancelled}`);
    console.log(`TASK 3 — Resend list size / contacts reconciled:       ${t3.resendListSize ?? 0} / ${t3.contactsReconciled ?? 0}`);
    console.log(`TASK 4 — final cancelled queue count:                  ${t4.totalCancelled}`);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }
})();
