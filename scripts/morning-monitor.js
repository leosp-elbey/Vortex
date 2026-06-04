#!/usr/bin/env node
// scripts/morning-monitor.js
// Phase 22C — daily 5-check operations monitor. Mirrors the
// /api/cron/morning-monitor route but runs from a local terminal.
//
// Run:
//   node scripts/morning-monitor.js            # check-only
//   node scripts/morning-monitor.js --fix      # also auto-fix fixable issues
//
// Exits with code 1 if any check returns WARNING or RED, so this can be
// wrapped in `&&` or a CI/cron health probe and detect failure.
//
// Loads SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, RESEND_API_KEY
// from .env.local. Never echoes credential values.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.resolve(__dirname, '..', '.env.local');
const ARG_FIX = process.argv.includes('--fix');

// ---------- env loading ----------
function loadEnv(p) {
  const txt = fs.readFileSync(p, 'utf8').replace(/\r/g, '');
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
};

const results = []; // { check, status: 'OK'|'WARNING'|'RED'|'FIXED', message }
function record(check, status, message) {
  results.push({ check, status, message });
  const icon = status === 'OK' ? '✅' : status === 'FIXED' ? '🔧' : status === 'WARNING' ? '⚠️ ' : '🔴';
  console.log(`${icon} [${check}] ${status}: ${message}`);
}

// ---------- supabase helpers ----------
async function supaSelect(table, qs) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs}`, { headers: supaHeaders });
  if (!r.ok) throw new Error(`Supabase SELECT ${table} failed (${r.status}): ${await r.text()}`);
  return r.json();
}

async function supaCount(table, qs) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs}&select=id`, {
    headers: { ...supaHeaders, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!r.ok) throw new Error(`Supabase COUNT ${table} failed (${r.status}): ${await r.text()}`);
  const cr = r.headers.get('content-range') || '';
  return Number.parseInt(cr.split('/')[1] || '0', 10);
}

async function supaPatch(table, filter, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${table} failed (${r.status}): ${await r.text()}`);
  return r.json();
}

// ---------- CHECK 1: autoposter cron status ----------
async function check1() {
  const rows = await supaSelect('site_settings', 'key=eq.autoposter_cron_enabled&select=key,value&limit=1');
  if (!rows.length) {
    record('CHECK 1 autoposter', 'WARNING', "site_settings row 'autoposter_cron_enabled' not found");
    return;
  }
  const value = String(rows[0].value).toLowerCase();
  if (value === 'true') {
    record('CHECK 1 autoposter', 'OK', 'autoposter enabled');
    return;
  }
  // value is false (or anything not 'true')
  if (ARG_FIX) {
    await supaPatch('site_settings', 'key=eq.autoposter_cron_enabled', { value: 'true' });
    record('CHECK 1 autoposter', 'FIXED', `autoposter re-enabled (was ${value})`);
  } else {
    record('CHECK 1 autoposter', 'WARNING', `autoposter DISABLED (value=${value}). Run with --fix to re-enable`);
  }
}

// ---------- CHECK 2: tiktok token expiry ----------
async function check2() {
  const rows = await supaSelect('site_settings', 'key=eq.tiktok_token_expires_at&select=key,value&limit=1');
  if (!rows.length) {
    record('CHECK 2 tiktok-expiry', 'WARNING', "site_settings row 'tiktok_token_expires_at' not found");
    return;
  }
  const raw = rows[0].value;
  const expiresAt = new Date(raw);
  if (Number.isNaN(expiresAt.getTime())) {
    record('CHECK 2 tiktok-expiry', 'WARNING', `tiktok_token_expires_at not parseable as date: ${raw}`);
    return;
  }
  const cutoff = new Date(Date.now() + 2 * 60 * 60 * 1000); // now + 2h
  if (expiresAt < cutoff) {
    record('CHECK 2 tiktok-expiry', 'WARNING', `TikTok token expires soon (${expiresAt.toISOString()}) — visit vortextrips.com/api/auth/tiktok/login`);
  } else {
    record('CHECK 2 tiktok-expiry', 'OK', `TikTok token valid until ${expiresAt.toISOString()}`);
  }
}

// ---------- CHECK 3: content queue depth ----------
async function check3() {
  const qs = 'status=eq.approved&posting_status=eq.ready';
  const count = await supaCount('content_calendar', qs);
  if (count < 10) {
    record('CHECK 3 queue-depth', 'WARNING', `queue low (${count} posts) — generate more content`);
  } else {
    record('CHECK 3 queue-depth', 'OK', `queue depth ${count} posts`);
  }
}

// ---------- CHECK 4: Resend bounce rate last 24h ----------
async function check4() {
  // Resend's /emails endpoint returns recent sends. The free-tier list is
  // bounded; treat 'in flight' separately so the denominator only counts
  // finalized events.
  const r = await fetch('https://api.resend.com/emails?limit=100', {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  });
  if (!r.ok) {
    record('CHECK 4 bounce-rate', 'WARNING', `Resend API call failed: ${r.status}`);
    return;
  }
  const body = await r.json();
  const emails = Array.isArray(body) ? body : (body.data || []);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  let delivered = 0, bounced = 0, complained = 0, finalized = 0;
  for (const e of emails) {
    const created = e.created_at ? new Date(e.created_at).getTime() : 0;
    if (!created || created < since) continue;
    const ev = (e.last_event || '').toLowerCase();
    if (ev === 'delivered' || ev === 'opened' || ev === 'clicked') { delivered++; finalized++; }
    else if (ev === 'bounced') { bounced++; finalized++; }
    else if (ev === 'complained') { complained++; finalized++; }
    else if (ev === 'send_failed' || ev === 'undelivered' || ev === 'dropped') { finalized++; }
    // sent/queued/scheduled/delivery_delayed → in flight, skipped from denominator
  }
  if (finalized < 5) {
    record('CHECK 4 bounce-rate', 'OK', `low volume (finalized=${finalized}) — verdict skipped`);
    return;
  }
  const bounceRate = (bounced / finalized) * 100;
  if (bounceRate > 5) {
    record('CHECK 4 bounce-rate', 'RED', `bounce rate ${bounceRate.toFixed(1)}% (${bounced}/${finalized}) — run cleanup-bounces.mjs`);
  } else {
    record('CHECK 4 bounce-rate', 'OK', `bounce rate ${bounceRate.toFixed(1)}% (${bounced}/${finalized})`);
  }
}

// ---------- CHECK 5: recent autoposter success (25h window) ----------
async function check5() {
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const qs = `posted_at=gt.${since}`;
  const count = await supaCount('content_calendar', qs);
  if (count === 0) {
    record('CHECK 5 recent-posts', 'WARNING', 'no posts in last 25 hours — check autoposter');
  } else {
    record('CHECK 5 recent-posts', 'OK', `${count} posts in last 25 hours`);
  }
}

// ---------- main ----------
(async () => {
  console.log(`Mode: ${ARG_FIX ? 'CHECK + FIX' : 'CHECK ONLY'}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  const checks = [check1, check2, check3, check4, check5];
  for (const fn of checks) {
    try { await fn(); }
    catch (err) {
      record(fn.name, 'RED', `check threw: ${err.message}`);
    }
  }

  // Summary
  console.log('');
  console.log('========== SUMMARY ==========');
  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(`Total checks: ${results.length}`);
  for (const s of ['OK', 'FIXED', 'WARNING', 'RED']) {
    if (counts[s]) console.log(`  ${s}: ${counts[s]}`);
  }
  const hasFailure = (counts.WARNING || 0) + (counts.RED || 0) > 0;
  process.exit(hasFailure ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
