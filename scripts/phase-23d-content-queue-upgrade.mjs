#!/usr/bin/env node
// scripts/phase-23d-content-queue-upgrade.mjs
// Phase 23C follow-up (2026-06-23) — content_calendar queue upgrade:
//   Step 1: verify 6 known-id rows + Powerline row still exist and are unposted.
//   Step 2: retire 3 known-id TikTok rows + the Powerline IG row (status='rejected').
//   Step 3: upgrade 3 known-id TikTok captions + the "Did you know" FB caption.
//   Step 4: insert 4 new TT / IG / FB rows into the ready queue.
//
// Usage:
//   node scripts/phase-23d-content-queue-upgrade.mjs             # dry-run: Step 1 only, no writes
//   node scripts/phase-23d-content-queue-upgrade.mjs --execute   # runs Steps 2..4 after Step 1 passes
//
// If Step 1's Powerline SELECT returns > 1 row, the script prints them all and
// aborts. Re-run with:
//   node scripts/phase-23d-content-queue-upgrade.mjs --execute --powerline-id=<uuid>
//
// Behavior on failure:
//   - Step 1 verify — if fewer than 6 known IDs found, or 0/>1 Powerline rows
//     without --powerline-id, or any target row already has posted_at set,
//     the script prints the issue and exits with code 2. No writes.
//   - Step 2 retire — if any of the 4 UPDATEs returns 0 rows, subsequent
//     steps do not run. Exit code 3.
//   - Step 3 upgrade — same abort logic. Exit code 4.
//   - Step 4 insert — if fewer than 4 rows returned by INSERT, exit code 5.
//
// All defensive WHERE clauses from the spec are preserved verbatim
// (posted_at IS NULL, platform match).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env.local');
const EXECUTE = process.argv.includes('--execute');
const POWERLINE_ID_ARG = process.argv.find(a => a.startsWith('--powerline-id='))?.split('=')[1];

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

if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const H_READ = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
};
const H_WRITE = {
  ...H_READ,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// ---------- known IDs from spec ----------
const KNOWN_IDS = [
  '3dd1e876-c022-499b-9250-2a3df4f44bab', // TT retire — "Who's ready for a beach vacation"
  '86927819-e07f-4fa8-9f53-870110b78534', // TT upgrade — "Public tours cost a fortune"
  '60f23190-a0ad-4511-ad3e-f23a1ee95ca2', // TT retire — "Earn while you travel"
  'bdb6ccc2-0810-4bd8-9025-bea796443c38', // TT upgrade — "$50 for a day in Bali"
  '518d1901-9574-462d-ace5-a1252360a77a', // TT retire — "Discover how to save up to 75%"
  '3dca9272-6e13-4237-92ca-579de8241881', // TT upgrade — "$1,200 trips for only $400"
];

const RETIRE_IDS = [
  { id: '3dd1e876-c022-499b-9250-2a3df4f44bab', platform: 'tiktok', reason: '[manually retired 2026-06-23] Weak hook — no specific savings number. Replaced with stronger content.' },
  { id: '60f23190-a0ad-4511-ad3e-f23a1ee95ca2', platform: 'tiktok', reason: '[manually retired 2026-06-23] SBA/income framing in travel post — violates brand rules. Removed.' },
  { id: '518d1901-9574-462d-ace5-a1252360a77a', platform: 'tiktok', reason: '[manually retired 2026-06-23] "Discover how" opener — zero scroll-stop value. Replaced.' },
];

const UPGRADE_ROWS = [
  {
    id: '86927819-e07f-4fa8-9f53-870110b78534',
    platform: 'tiktok',
    caption: 'Travel agents mark up tours 300%. Members skip the markup — same trips, fraction of the cost. Link in bio 👇 vortextrips.com/free',
  },
  {
    id: 'bdb6ccc2-0810-4bd8-9025-bea796443c38',
    platform: 'tiktok',
    caption: '$50 a day in Bali. That\'s what members actually pay. Most tourists pay $180+. How? Wholesale travel rates. vortextrips.com/free 🌴',
  },
  {
    id: '3dca9272-6e13-4237-92ca-579de8241881',
    platform: 'tiktok',
    caption: '$1,200 resort trip for $400. Members don\'t pay retail. Neither should you. vortextrips.com/free 🏝️',
  },
];

const INSERT_ROWS = [
  {
    platform: 'tiktok',
    status: 'approved',
    posting_status: 'ready',
    caption: 'POV: You just found out the hotel you paid $400 for was $89 for members. 😶 vortextrips.com/free',
    hashtags: ['TravelHacks', 'TravelSavings', 'WholesaleTravel', 'VortexTrips'],
    posting_gate_approved: true,
  },
  {
    platform: 'tiktok',
    status: 'approved',
    posting_status: 'ready',
    caption: 'They don\'t want you to know hotels have a "member rate." We unlocked it. vortextrips.com/free 🔓',
    hashtags: ['TravelHacks', 'TravelSavings', 'WholesaleTravel', 'VortexTrips'],
    posting_gate_approved: true,
  },
  {
    platform: 'instagram',
    status: 'approved',
    posting_status: 'ready',
    caption: 'The same Cancún resort. Two prices.\n\nPublic rate: $2,800\nMember rate: $1,540\n\nThe difference is a travel membership. Start free at vortextrips.com/free',
    hashtags: ['TravelSavings', 'CancunTravel', 'TravelHacks', 'VortexTrips'],
    posting_gate_approved: true,
  },
  {
    platform: 'facebook',
    status: 'approved',
    posting_status: 'ready',
    caption: 'Most people overpay for travel their entire lives without knowing it.\n\nHotel wholesale rates exist — they\'re just not advertised.\n\nVortexTrips members get access. See how much you\'d save: vortextrips.com/free',
    hashtags: ['TravelSavings', 'TravelHacks', 'VortexTrips'],
    posting_gate_approved: true,
  },
];

// ---------- HTTP helpers ----------
async function pgGet(pathAndQuery) {
  const url = `${SUPA_URL}/rest/v1/${pathAndQuery}`;
  const res = await fetch(url, { headers: H_READ });
  if (!res.ok) {
    throw new Error(`GET ${pathAndQuery} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function pgPatch(pathAndQuery, body) {
  const url = `${SUPA_URL}/rest/v1/${pathAndQuery}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: H_WRITE,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${pathAndQuery} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function pgPost(path, body) {
  const url = `${SUPA_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: H_WRITE,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ---------- output helpers ----------
function truncate(s, n = 90) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function printRow(r) {
  const p = (r.platform ?? '').padEnd(10);
  const s = (r.status ?? '—').padEnd(10);
  const ps = (r.posting_status ?? '—').padEnd(10);
  console.log(`  ${r.id}  ${p}  ${s}  ${ps}  ${truncate(r.caption)}`);
}

// ---------- STEP 1: VERIFY ----------
async function step1Verify() {
  console.log('\n=== STEP 1 — VERIFY (read-only) ===\n');

  // Known IDs
  const idList = KNOWN_IDS.map(id => `"${id}"`).join(',');
  const known = await pgGet(
    `content_calendar?id=in.(${idList})&select=id,platform,caption,status,posting_status,posted_at`,
  );
  console.log(`Known-ID rows found: ${known.length} of ${KNOWN_IDS.length} expected`);
  console.log(`  ${'id'.padEnd(36)}  ${'platform'.padEnd(10)}  ${'status'.padEnd(10)}  ${'posting_status'.padEnd(10)}  caption`);
  for (const r of known) printRow(r);

  const foundIds = new Set(known.map(r => r.id));
  const missing = KNOWN_IDS.filter(id => !foundIds.has(id));
  if (missing.length > 0) {
    console.error(`\nABORT: ${missing.length} expected rows missing:`);
    for (const id of missing) console.error(`  - ${id}`);
    process.exit(2);
  }

  const alreadyPosted = known.filter(r => r.posted_at !== null);
  if (alreadyPosted.length > 0) {
    console.error(`\nABORT: ${alreadyPosted.length} expected rows already posted (posted_at NOT NULL):`);
    for (const r of alreadyPosted) console.error(`  - ${r.id} (${r.platform})`);
    process.exit(2);
  }

  // Powerline row(s)
  console.log('\n--- Powerline search (LIKE %Powerline%, posted_at IS NULL) ---');
  const pl = await pgGet(
    `content_calendar?caption=ilike.*Powerline*&posted_at=is.null&select=id,platform,caption,status,posting_status,posted_at`,
  );
  console.log(`Powerline candidate rows: ${pl.length}`);
  for (const r of pl) printRow(r);

  let powerlineId = POWERLINE_ID_ARG;
  const igPowerlineRows = pl.filter(r => r.platform === 'instagram');

  if (pl.length === 0) {
    console.error('\nABORT: no Powerline row found — Step 2 would retire 0 rows.');
    process.exit(2);
  }
  if (!powerlineId) {
    if (igPowerlineRows.length === 1) {
      powerlineId = igPowerlineRows[0].id;
      console.log(`\nAuto-selected Powerline IG row: ${powerlineId}`);
    } else if (igPowerlineRows.length === 0) {
      console.error('\nABORT: Powerline row(s) exist but none is on Instagram platform. Nothing to retire.');
      process.exit(2);
    } else {
      console.error(`\nABORT: ${igPowerlineRows.length} Powerline IG rows found — ambiguous. Re-run with --powerline-id=<uuid>:`);
      for (const r of igPowerlineRows) console.error(`  - ${r.id}`);
      process.exit(2);
    }
  } else {
    const match = pl.find(r => r.id === powerlineId);
    if (!match) {
      console.error(`\nABORT: --powerline-id=${powerlineId} not present in Powerline search results.`);
      process.exit(2);
    }
    if (match.platform !== 'instagram') {
      console.error(`\nABORT: --powerline-id=${powerlineId} is platform='${match.platform}', not instagram.`);
      process.exit(2);
    }
    console.log(`\nUsing operator-provided Powerline IG row: ${powerlineId}`);
  }

  console.log('\n✅ Step 1 verify PASSED.');
  return { powerlineId };
}

// ---------- STEP 2: RETIRE ----------
async function step2Retire(powerlineId) {
  console.log('\n=== STEP 2 — RETIRE 4 ROWS ===\n');
  const rejected = [];

  // 3 known-id retires (TT)
  for (const target of RETIRE_IDS) {
    const returned = await pgPatch(
      `content_calendar?id=eq.${target.id}&platform=eq.${target.platform}&posted_at=is.null&select=id,platform,status,posting_status,caption`,
      {
        posting_status: null,
        queued_for_posting_at: null,
        status: 'rejected',
        last_post_failure_reason: target.reason,
      },
    );
    if (returned.length !== 1) {
      console.error(`\nABORT: retire UPDATE for ${target.id} returned ${returned.length} rows (expected 1).`);
      process.exit(3);
    }
    console.log(`RETURNING (${target.id}):`);
    printRow(returned[0]);
    rejected.push(returned[0]);
  }

  // Powerline IG retire (by id — resolved in Step 1)
  const powerlineReason = '[manually retired 2026-06-23] "Powerline" is MLM language — violates strict brand rules. Removed.';
  const plReturned = await pgPatch(
    `content_calendar?id=eq.${powerlineId}&platform=eq.instagram&posted_at=is.null&select=id,platform,status,posting_status,caption`,
    {
      posting_status: null,
      queued_for_posting_at: null,
      status: 'rejected',
      last_post_failure_reason: powerlineReason,
    },
  );
  if (plReturned.length !== 1) {
    console.error(`\nABORT: Powerline retire UPDATE returned ${plReturned.length} rows (expected 1).`);
    process.exit(3);
  }
  console.log(`RETURNING (Powerline IG ${powerlineId}):`);
  printRow(plReturned[0]);
  rejected.push(plReturned[0]);

  const nonRejected = rejected.filter(r => r.status !== 'rejected' || r.posting_status !== null);
  if (nonRejected.length > 0) {
    console.error(`\nABORT: ${nonRejected.length} retire UPDATEs did not land the expected state.`);
    for (const r of nonRejected) console.error(`  - ${r.id}: status=${r.status} posting_status=${r.posting_status}`);
    process.exit(3);
  }

  console.log(`\n✅ Step 2 retired ${rejected.length} rows.`);
  return { retiredCount: rejected.length };
}

// ---------- STEP 3: UPGRADE ----------
async function step3Upgrade() {
  console.log('\n=== STEP 3 — UPGRADE 4 CAPTIONS ===\n');
  const upgraded = [];

  // 3 known-id TT upgrades
  for (const target of UPGRADE_ROWS) {
    const returned = await pgPatch(
      `content_calendar?id=eq.${target.id}&platform=eq.${target.platform}&posted_at=is.null&select=id,platform,caption`,
      { caption: target.caption },
    );
    if (returned.length !== 1) {
      console.error(`\nABORT: caption UPDATE for ${target.id} returned ${returned.length} rows (expected 1).`);
      process.exit(4);
    }
    if (returned[0].caption !== target.caption) {
      console.error(`\nABORT: caption UPDATE for ${target.id} did not land the new text.`);
      process.exit(4);
    }
    console.log(`RETURNING (${target.id}):`);
    printRow(returned[0]);
    upgraded.push(returned[0]);
  }

  // Facebook "Did you know" caption — matched by LIKE (spec)
  const fbNewCaption = '$1,847 saved on a single Bali trip. That\'s not a sale — that\'s a member rate. See what you\'d save: vortextrips.com/free';
  const fbReturned = await pgPatch(
    `content_calendar?caption=like.*Did%20you%20know%20you%20can%20save%20up%20to%2075%25*&platform=eq.facebook&posted_at=is.null&select=id,platform,caption`,
    { caption: fbNewCaption },
  );
  if (fbReturned.length !== 1) {
    console.error(`\nABORT: FB "Did you know" caption UPDATE returned ${fbReturned.length} rows (expected 1).`);
    console.error('  → If 0, no matching FB row exists; if >1, disambiguate manually.');
    process.exit(4);
  }
  console.log(`RETURNING (FB "Did you know" upgrade):`);
  printRow(fbReturned[0]);
  upgraded.push(fbReturned[0]);

  console.log(`\n✅ Step 3 upgraded ${upgraded.length} captions.`);
  return { upgradedCount: upgraded.length };
}

// ---------- STEP 4: INSERT ----------
async function step4Insert() {
  console.log('\n=== STEP 4 — INSERT 4 NEW ROWS ===\n');
  const nowIso = new Date().toISOString();
  const payload = INSERT_ROWS.map(r => ({
    platform: r.platform,
    status: r.status,
    posting_status: r.posting_status,
    caption: r.caption,
    hashtags: r.hashtags,
    queued_for_posting_at: nowIso,
    posting_gate_approved: r.posting_gate_approved,
  }));

  const returned = await pgPost(
    'content_calendar?select=id,platform,caption',
    payload,
  );
  if (returned.length !== INSERT_ROWS.length) {
    console.error(`\nABORT: INSERT returned ${returned.length} rows (expected ${INSERT_ROWS.length}).`);
    process.exit(5);
  }

  console.log(`RETURNING (${returned.length} rows):`);
  for (const r of returned) printRow(r);

  console.log(`\n✅ Step 4 inserted ${returned.length} rows.`);
  return { insertedCount: returned.length };
}

// ---------- COMPLETION REPORT ----------
async function completionReport(counts) {
  console.log('\n=== COMPLETION REPORT ===');
  console.log(`  Retired : ${counts.retiredCount}`);
  console.log(`  Upgraded: ${counts.upgradedCount}`);
  console.log(`  Inserted: ${counts.insertedCount}`);

  const q = await pgGet(
    `content_calendar?posting_status=eq.ready&posted_at=is.null&platform=in.("facebook","instagram","tiktok")&select=platform`,
  );
  const byPlatform = q.reduce((acc, r) => ({ ...acc, [r.platform]: (acc[r.platform] ?? 0) + 1 }), {});
  console.log('\nFinal queue count by platform (posting_status=ready, unposted):');
  for (const p of ['facebook', 'instagram', 'tiktok']) {
    console.log(`  ${p.padEnd(10)}: ${byPlatform[p] ?? 0}`);
  }

  console.log('\ntsc: not needed (SQL-only via PostgREST, no TS code changes).');
}

// ---------- MAIN ----------
(async () => {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (Steps 1..4)' : 'DRY-RUN (Step 1 verify only)'}`);
  const { powerlineId } = await step1Verify();
  if (!EXECUTE) {
    console.log('\nDry-run complete. Re-run with --execute to apply Steps 2..4.');
    return;
  }
  const s2 = await step2Retire(powerlineId);
  const s3 = await step3Upgrade();
  const s4 = await step4Insert();
  await completionReport({
    retiredCount: s2.retiredCount,
    upgradedCount: s3.upgradedCount,
    insertedCount: s4.insertedCount,
  });
})().catch(err => {
  console.error('\nUNEXPECTED ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
