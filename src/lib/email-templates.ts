const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.vortextrips.com'

// Surge365 corporate affiliate links. Signup is path-based (/leosp); the corporate video pages still use the wa=leosp query.
const SURGE365 = {
  opportunityVideo: 'https://surge365.com/Page/OpportunityVideo/wa=leosp',
  powerlineVideo: 'https://surge365.com/Page/powerlinevideo/wa=leosp',
  signup: 'https://signup.surge365.com/leosp',
}

function wrapper(content: string): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:#FF6B35;padding:20px 28px;display:flex;align-items:center">
    <span style="font-size:22px;font-weight:900;color:white;letter-spacing:-0.5px">Vortex<span style="color:#1A1A2E">Trips</span></span>
  </div>
  <div style="padding:32px 28px;color:#1A1A2E;line-height:1.7">
    ${content}
  </div>
  <div style="background:#f9f9f9;padding:20px 28px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center">
    <p style="margin:0 0 6px">VortexTrips &nbsp;·&nbsp; <a href="${BASE_URL}" style="color:#FF6B35;text-decoration:none">vortextrips.com</a></p>
    <p style="margin:0">Questions? <a href="mailto:support@vortextrips.com" style="color:#999">support@vortextrips.com</a></p>
    <p style="margin:8px 0 0;font-size:11px;color:#bbb">You're receiving this because you requested a travel savings quote. <a href="${BASE_URL}/unsubscribe" style="color:#bbb">Unsubscribe</a></p>
  </div>
</div>`
}

function ctaButton(text: string, href: string): string {
  return `<div style="text-align:center;margin:28px 0">
    <a href="${href}" style="background:#FF6B35;color:white;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;display:inline-block">${text}</a>
  </div>`
}

function savingsBadge(text: string): string {
  return `<div style="background:#16C79A;color:white;font-weight:700;border-radius:8px;padding:12px 20px;margin:20px 0;text-align:center;font-size:18px">${text}</div>`
}

// ─── LEAD NURTURE SEQUENCE ────────────────────────────────────────────────────

export const EMAIL_TEMPLATES = {

  // Day 1 — Welcome + what's coming
  leadDay1: (firstName: string) => ({
    subject: `Welcome to VortexTrips, ${firstName} — here's what happens next`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Hey ${firstName}, you're in. Here's your next step.</h2>
      <p>You just joined over <strong>2,000 members</strong> who stop paying retail prices for travel — forever.</p>
      <p>Here's exactly what you get as a VortexTrips member:</p>
      <ul style="padding-left:20px;color:#444">
        <li style="margin-bottom:8px"><strong>Access to 500,000+ hotels</strong> at wholesale rates — up to 60% below Expedia and Booking.com</li>
        <li style="margin-bottom:8px"><strong>Unpublished flight fares</strong> — consolidator rates the public can't see</li>
        <li style="margin-bottom:8px"><strong>Your personal AI travel consultant</strong> — available 24/7 to find and price your trips</li>
        <li style="margin-bottom:8px"><strong>Cruise and resort packages</strong> at 40–50% below retail</li>
      </ul>
      ${savingsBadge('Average member saves $1,200+ per trip')}
      <p>Ready to see your first deal? Start with our booking portal — it takes 60 seconds to find savings on your next trip.</p>
      ${ctaButton('See My Member Rates →', `${BASE_URL}/book`)}
      <p style="color:#888;font-size:14px">Have questions? Just reply to this email — I read every one.<br><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 3 — Social proof
  leadDay3: (firstName: string) => ({
    subject: `${firstName}, real members. Real savings. Real receipts.`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Don't take our word for it, ${firstName}.</h2>
      <p>Here's what members saved on their last trip:</p>

      <div style="background:#f9f9f9;border-left:4px solid #FF6B35;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
        <p style="margin:0 0 8px;font-style:italic;color:#444">"I was skeptical at first, but we saved almost $2,000 on our family vacation to Cancún compared to Expedia. The hotel alone was 52% cheaper. This membership paid for itself 10x over."</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#FF6B35">— Jessica T., Austin TX &nbsp;·&nbsp; Saved $1,847</p>
      </div>

      <div style="background:#f9f9f9;border-left:4px solid #16C79A;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
        <p style="margin:0 0 8px;font-style:italic;color:#444">"VortexTrips found us a 5-star hotel in Paris for the price of a 3-star. Our entire honeymoon cost less than what most people spend on flights alone."</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#16C79A">— Michelle R., Atlanta GA &nbsp;·&nbsp; Saved $3,200</p>
      </div>

      <div style="background:#f9f9f9;border-left:4px solid #FF6B35;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
        <p style="margin:0 0 8px;font-style:italic;color:#444">"Called within a minute of signing up. Got us a suite for $189/night listed at $389 everywhere else. Incredible."</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#FF6B35">— Scott L., Chicago IL &nbsp;·&nbsp; Saved $940</p>
      </div>

      <p>${firstName}, your savings are waiting. What's your next trip?</p>
      ${ctaButton('Get My Savings Quote →', `${BASE_URL}/quote`)}
    `),
  }),

  // Day 5 — Feature deep dive / savings calculator angle
  leadDay5: (firstName: string) => ({
    subject: `How much would YOU save on your next trip, ${firstName}?`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Let's run the numbers, ${firstName}.</h2>
      <p>Most people don't realize how much they're overpaying until they see it side-by-side. Here's a typical comparison:</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px">
        <thead>
          <tr style="background:#1A1A2E;color:white">
            <th style="padding:12px 16px;text-align:left">Trip (4 nights, 2 people)</th>
            <th style="padding:12px 16px;text-align:center">Expedia / Booking</th>
            <th style="padding:12px 16px;text-align:center;color:#16C79A">VortexTrips</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#f9f9f9">
            <td style="padding:12px 16px">Cancún all-inclusive resort</td>
            <td style="padding:12px 16px;text-align:center">$2,800</td>
            <td style="padding:12px 16px;text-align:center;color:#16C79A;font-weight:700">$1,540</td>
          </tr>
          <tr>
            <td style="padding:12px 16px">Paris 4-star hotel</td>
            <td style="padding:12px 16px;text-align:center">$1,960</td>
            <td style="padding:12px 16px;text-align:center;color:#16C79A;font-weight:700">$980</td>
          </tr>
          <tr style="background:#f9f9f9">
            <td style="padding:12px 16px">Vegas luxury suite weekend</td>
            <td style="padding:12px 16px;text-align:center">$1,200</td>
            <td style="padding:12px 16px;text-align:center;color:#16C79A;font-weight:700">$620</td>
          </tr>
        </tbody>
      </table>

      ${savingsBadge('That\'s $1,260 — $980 saved per trip on average')}

      <p>The membership pays for itself on the very first booking — often within the first night.</p>
      <p>Tell us where you want to go and we'll show you the exact savings before you commit to anything.</p>
      ${ctaButton('Show Me My Savings →', `${BASE_URL}/quote`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 7 — Urgency + limited spots
  leadDay7: (firstName: string) => ({
    subject: `${firstName} — a quick note before rates change`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Hey ${firstName} — rates don't stay this low forever.</h2>
      <p>I wanted to reach out personally because I've seen this happen too many times.</p>
      <p>Someone checks out our member rates, thinks "I'll do this later" — and by the time they come back, the deal they wanted is gone. Hotels adjust pricing constantly. The wholesale rates we lock in today may not be here next week.</p>
      <p>Here's what I know about our current inventory:</p>
      <ul style="padding-left:20px;color:#444">
        <li style="margin-bottom:8px">🏨 <strong>Cancún all-inclusives</strong> — member rates down 54% right now</li>
        <li style="margin-bottom:8px">✈️ <strong>Caribbean cruise packages</strong> — 3 departure dates with inventory</li>
        <li style="margin-bottom:8px">🗼 <strong>Europe spring packages</strong> — Paris / Rome at 2024 pricing</li>
      </ul>
      <p>If any of these match your plans, now is the time to lock it in.</p>
      ${ctaButton('Lock In My Member Rate →', `${BASE_URL}/book`)}
      <p style="color:#888;font-size:14px">If timing isn't right, just reply and let me know — I'll keep an eye on your destination and reach out when something perfect comes up.<br><br><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 10 — FAQ / objection handling
  leadDay10: (firstName: string) => ({
    subject: `${firstName}, the questions I get asked most (honest answers inside)`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Let me answer the questions I get asked most, ${firstName}.</h2>
      <p>If you haven't jumped in yet, here's what's usually holding people back — and the honest truth:</p>

      <div style="margin:20px 0">
        <p style="font-weight:700;color:#FF6B35;margin-bottom:4px">❓ "Is this really worth it for just one trip a year?"</p>
        <p style="margin:0 0 16px;color:#444">Yes — if you take even one trip a year and save $800–$1,200, the membership has already paid for itself multiple times over. Most members break even on their first booking night.</p>

        <p style="font-weight:700;color:#FF6B35;margin-bottom:4px">❓ "How is this different from Hotels.com or Expedia?"</p>
        <p style="margin:0 0 16px;color:#444">Those are retail platforms. We access wholesale and consolidator rates that aren't available to the public — the same rates travel agents and corporate buyers use. It's a completely different pricing tier.</p>

        <p style="font-weight:700;color:#FF6B35;margin-bottom:4px">❓ "What if I don't like it?"</p>
        <p style="margin:0 0 16px;color:#444">Cancel anytime. No contracts, no penalties. We'd rather earn your loyalty with results than lock you in with fine print.</p>

        <p style="font-weight:700;color:#FF6B35;margin-bottom:4px">❓ "Are the savings really 40–60%?"</p>
        <p style="margin:0 0 16px;color:#444">Based on real member bookings compared to the same room/date on public booking sites. Some save more, some save less — it depends on destination and dates. We show you the comparison before you book so you always know exactly what you're saving.</p>
      </div>

      <p>Still have a question I didn't answer? Just reply — I'll get back to you personally.</p>
      ${ctaButton('Get Started — No Credit Card Required →', `${BASE_URL}/join`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 14 — Final / breakup email
  leadDay14: (firstName: string) => ({
    subject: `${firstName}, this is my last email (unless you want to hear from me)`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Last one, ${firstName}. I promise.</h2>
      <p>I've sent you a few emails about VortexTrips over the past two weeks. If the timing isn't right, I completely understand — travel plans have their own timeline.</p>
      <p>But before I go quiet, I want to leave you with one thing:</p>
      ${savingsBadge('Our members saved a combined $3.2M last year.')}
      <p>That's $3.2 million that stayed in their pockets instead of going to hotel chains and booking platforms.</p>
      <p>Whenever you're ready to plan your next trip — whether it's next month or next year — we'll be here with the same wholesale rates waiting for you.</p>
      ${ctaButton('Join When You\'re Ready →', `${BASE_URL}/join`)}
      <p>If you'd rather I stop emailing, just reply "unsubscribe" and I'll take you off immediately.</p>
      <p style="color:#888;font-size:14px">Thank you for your time, ${firstName}. Safe travels.<br><br><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // ─── SBA ONBOARDING SEQUENCE ──────────────────────────────────────────────

  // SBA Day 1 — Welcome to the team
  sbaDay1Email: (firstName: string) => ({
    subject: `Welcome to the VortexTrips team, ${firstName} — your access is live`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">You're officially on the team, ${firstName}. 🎉</h2>
      <p>Your Smart Business Affiliate (SBA) account is active. Here's everything you need to hit the ground running:</p>

      <div style="background:#1A1A2E;border-radius:12px;padding:24px;margin:20px 0;color:white">
        <p style="margin:0 0 12px;font-weight:700;color:#FF6B35;font-size:16px">Your Affiliate Links</p>
        <p style="margin:0 0 8px;font-size:14px">📋 <strong>Free Access:</strong> <a href="${BASE_URL}/free" style="color:#16C79A">${BASE_URL}/free</a></p>
        <p style="margin:0 0 8px;font-size:14px">✈️ <strong>Booking Portal:</strong> <a href="${BASE_URL}/book" style="color:#16C79A">${BASE_URL}/book</a></p>
        <p style="margin:0;font-size:14px">💳 <strong>Join Page:</strong> <a href="${BASE_URL}/join" style="color:#16C79A">${BASE_URL}/join</a></p>
      </div>

      <p><strong>How to earn:</strong></p>
      <ol style="padding-left:20px;color:#444">
        <li style="margin-bottom:8px">Share your links on social media, text, or email</li>
        <li style="margin-bottom:8px">When someone signs up through your link, they're tagged to you</li>
        <li style="margin-bottom:8px">You earn commissions on their membership and any bookings</li>
      </ol>

      <p>The fastest path to your first commission: post one piece of content today. Show a deal, share a testimonial, or just tell your story. Authenticity converts.</p>
      ${ctaButton('Go to Your Booking Portal →', `${BASE_URL}/book`)}
      <p style="color:#888;font-size:14px">Questions? Your upline will reach out shortly. Or email <a href="mailto:support@vortextrips.com" style="color:#FF6B35">support@vortextrips.com</a> anytime.<br><br><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // SBA Day 3 — Getting started / content tips
  sbaDay3Email: (firstName: string) => ({
    subject: `${firstName} — the fastest way to your first commission`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">3 days in — let's get you your first commission, ${firstName}.</h2>
      <p>The affiliates who earn fastest all do one thing: they post <em>before</em> they feel ready.</p>
      <p>Here are the 3 content types that convert best for VortexTrips:</p>

      <div style="background:#f9f9f9;border-radius:8px;padding:16px 20px;margin:16px 0">
        <p style="margin:0 0 6px;font-weight:700;color:#FF6B35">1. The Savings Screenshot</p>
        <p style="margin:0;color:#444;font-size:14px">Book a trip through the portal. Screenshot the price comparison. Post it. Real numbers kill skepticism instantly.</p>
      </div>

      <div style="background:#f9f9f9;border-radius:8px;padding:16px 20px;margin:16px 0">
        <p style="margin:0 0 6px;font-weight:700;color:#FF6B35">2. The Personal Story</p>
        <p style="margin:0;color:#444;font-size:14px">"I found this travel membership and saved $X on my last trip — here's how it works." Authentic, simple, works on TikTok/Reels/Stories.</p>
      </div>

      <div style="background:#f9f9f9;border-radius:8px;padding:16px 20px;margin:16px 0">
        <p style="margin:0 0 6px;font-weight:700;color:#FF6B35">3. The Deal Alert</p>
        <p style="margin:0;color:#444;font-size:14px">Screenshot a specific deal (Cancún for $89/night, etc.) and post: "Members are seeing this right now." Urgency drives clicks.</p>
      </div>

      <p>All three work best when you include your link: <strong>${BASE_URL}/free</strong></p>
      ${ctaButton('Browse Deals to Screenshot →', `${BASE_URL}/book`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // SBA Day 7 — Week 1 check-in
  sbaDay7Email: (firstName: string) => ({
    subject: `Week 1 check-in, ${firstName} — how's it going?`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">One week in, ${firstName}. Let's talk.</h2>
      <p>It's been a week since you joined the VortexTrips team. I wanted to check in personally.</p>
      <p><strong>If you've already posted and shared your link:</strong> that's exactly right. Keep going — consistency beats perfection every time.</p>
      <p><strong>If you haven't posted yet:</strong> that's okay — but today's the day. Every day you wait is a day someone else in your network doesn't hear about this.</p>

      <p>Here's your weekly goal:</p>
      ${savingsBadge('3 posts this week. 1 link share per day.')}

      <p>Your links to share:</p>
      <ul style="padding-left:20px;color:#444">
        <li style="margin-bottom:6px"><a href="${BASE_URL}/free" style="color:#FF6B35">${BASE_URL}/free</a> — free access signup</li>
        <li style="margin-bottom:6px"><a href="${BASE_URL}/join" style="color:#FF6B35">${BASE_URL}/join</a> — membership join page</li>
      </ul>

      <p>Need help? Reply to this email and tell me where you're stuck. I'll get back to you personally.</p>
      ${ctaButton('Go to Booking Portal →', `${BASE_URL}/book`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // ─── MLM / NETWORK MARKETER OUTREACH SEQUENCE ────────────────────────────

  // Day 0 — Pattern interrupt. Speak their language.
  mlmDay0: (firstName: string) => ({
    subject: `${firstName} — the travel product that sells itself`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Hey ${firstName} — quick question.</h2>
      <p>How many times have you pitched a product and had to explain why someone needs it?</p>
      <p>Travel is different. Everyone already wants to travel. The only question is: <strong>how much are they paying?</strong></p>
      <p>VortexTrips gives members access to hotel rates 40–60% below Expedia, Booking.com, and every other public platform. When you show someone a side-by-side price comparison — the same room, same dates — it closes itself.</p>
      ${savingsBadge('No convincing required. The savings do the selling.')}
      <p>Over the next two weeks I want to show you exactly how this works, what our affiliates earn, and why travel converts better than almost any other product in network marketing.</p>
      <p>The fastest way to understand it — watch the official 5-minute opportunity video:</p>
      ${ctaButton('▶ Watch the Opportunity Video', SURGE365.opportunityVideo)}
      <p>Or jump straight to a real member-rate comparison:</p>
      ${ctaButton('See Member Rates →', `${BASE_URL}/destinations/cancun`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 2 — The product demo. Let the price gap do the work.
  mlmDay2: (firstName: string) => ({
    subject: `${firstName}, this is what your customers will see`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">This is what closes deals, ${firstName}.</h2>
      <p>When you share VortexTrips with someone, here's what they see:</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px">
        <thead>
          <tr style="background:#1A1A2E;color:white">
            <th style="padding:12px 16px;text-align:left">Same hotel. Same dates. Same room.</th>
            <th style="padding:12px 16px;text-align:center">Expedia</th>
            <th style="padding:12px 16px;text-align:center;color:#16C79A">VortexTrips</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#f9f9f9"><td style="padding:12px 16px">Cancún all-inclusive (4 nights)</td><td style="padding:12px 16px;text-align:center">$2,800</td><td style="padding:12px 16px;text-align:center;color:#16C79A;font-weight:700">$1,540</td></tr>
          <tr><td style="padding:12px 16px">Paris 4-star (3 nights)</td><td style="padding:12px 16px;text-align:center">$1,960</td><td style="padding:12px 16px;text-align:center;color:#16C79A;font-weight:700">$980</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:12px 16px">Vegas luxury suite (2 nights)</td><td style="padding:12px 16px;text-align:center">$1,200</td><td style="padding:12px 16px;text-align:center;color:#16C79A;font-weight:700">$620</td></tr>
        </tbody>
      </table>
      <p>That's the demo. Screenshot it. Post it. Send it. That's your content.</p>
      <p>People don't need convincing — they need to see the number. Once they see $1,260 saved on a single trip, the membership cost is irrelevant.</p>
      ${ctaButton('See Full Destination Pricing →', `${BASE_URL}/destinations/cancun`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 4 — SBA earnings. Show the money.
  mlmDay4: (firstName: string) => ({
    subject: `What VortexTrips affiliates actually earn, ${firstName}`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Let's talk about the money, ${firstName}.</h2>
      <p>You're in network marketing. You know how to evaluate an opportunity. So let me give you the straight numbers.</p>
      <div style="background:#1A1A2E;border-radius:12px;padding:24px;margin:20px 0;color:white">
        <p style="margin:0 0 16px;font-weight:700;color:#FF6B35;font-size:16px">Smart Business Affiliate (SBA) Program</p>
        <div style="display:grid;gap:12px">
          <div style="background:white/10;border-radius:8px;padding:12px 16px;background:rgba(255,255,255,0.08)">
            <p style="margin:0 0 4px;font-weight:700;color:#16C79A">Membership Commissions</p>
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.8)">Earn on every membership your referrals activate. Residual income on renewals.</p>
          </div>
          <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:12px 16px">
            <p style="margin:0 0 4px;font-weight:700;color:#16C79A">No inventory. No shipping. No explaining.</p>
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.8)">Digital product. Members access rates instantly. Nothing to fulfill.</p>
          </div>
          <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:12px 16px">
            <p style="margin:0 0 4px;font-weight:700;color:#16C79A">The product sells itself</p>
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.8)">Show the price comparison. Members save more than the annual cost on their first trip.</p>
          </div>
        </div>
      </div>
      <p>The best part? <strong>You're already talking to people who spend money on travel.</strong> Your existing network is your market.</p>
      <p>Want to see exactly how the comp plan works? The Powerline video walks through it:</p>
      ${ctaButton('▶ Watch the Powerline Video', SURGE365.powerlineVideo)}
      <p>Or see the full SBA breakdown on our site:</p>
      ${ctaButton('See the SBA Opportunity →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 6 — Objection handling. Answers to what they're thinking.
  mlmDay6: (firstName: string) => ({
    subject: `"I'm already in something" — I hear this a lot, ${firstName}`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">"I already have a company." — Let me address this directly.</h2>
      <p>Most people I talk to are already in network marketing. Some are killing it. Some are grinding. Here's what I tell them:</p>
      <div style="margin:20px 0">
        <p style="font-weight:700;color:#FF6B35;margin-bottom:4px">VortexTrips doesn't compete with what you're doing.</p>
        <p style="color:#444;margin-bottom:16px">Travel savings is a completely different conversation than health products, skincare, or financial services. Your same network, completely different market positioning.</p>
        <p style="font-weight:700;color:#FF6B35;margin-bottom:4px">You can run it alongside your existing business.</p>
        <p style="color:#444;margin-bottom:16px">Many of our top affiliates use it as a second income stream — or a conversation starter that leads people into their primary opportunity.</p>
        <p style="font-weight:700;color:#FF6B35;margin-bottom:4px">The product creates fans, not just customers.</p>
        <p style="color:#444;margin-bottom:0">When someone saves $1,400 on their vacation, they tell their friends. Organic referrals come naturally when the savings are real.</p>
      </div>
      ${savingsBadge('Your network already spends money on travel. Redirect that spend.')}
      ${ctaButton('Learn How the SBA Program Works →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 9 — Social proof from SBAs
  mlmDay9: (firstName: string) => ({
    subject: `${firstName} — what network marketers are saying after 90 days`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Real results from people who were exactly where you are, ${firstName}.</h2>
      <div style="background:#f9f9f9;border-left:4px solid #FF6B35;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
        <p style="margin:0 0 8px;font-style:italic;color:#444">"I've been in 3 different MLMs. Travel is the easiest conversation I've ever had. I showed my cousin a hotel comparison and she signed up before I finished explaining. It literally sells itself."</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#FF6B35">— Marcus D., Miami FL · SBA for 6 months</p>
      </div>
      <div style="background:#f9f9f9;border-left:4px solid #16C79A;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
        <p style="margin:0 0 8px;font-style:italic;color:#444">"I post a price comparison screenshot once a week on Instagram. My DMs fill up. I don't have to pitch — people ask me how to get access."</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#16C79A">— Tamika R., Houston TX · SBA for 4 months</p>
      </div>
      <div style="background:#f9f9f9;border-left:4px solid #FF6B35;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
        <p style="margin:0 0 8px;font-style:italic;color:#444">"The training and support is better than any company I've been with. And the product? I used it myself first — saved over $2,000 on a family trip. That's my testimonial."</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#FF6B35">— Jerome W., Atlanta GA · SBA for 3 months</p>
      </div>
      <p>${firstName}, the pattern here is the same: <strong>use it, save money, share the screenshot.</strong> That's the entire playbook.</p>
      ${ctaButton('Start Your SBA Application →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 12 — The comparison close. Travel vs other MLMs.
  mlmDay12: (firstName: string) => ({
    subject: `${firstName}, why travel beats supplements in network marketing`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Let me make a case for travel, ${firstName}.</h2>
      <p>I've watched people struggle in network marketing for years trying to sell things people don't urgently want. Here's the honest comparison:</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
        <thead>
          <tr style="background:#1A1A2E;color:white">
            <th style="padding:12px 16px;text-align:left">Factor</th>
            <th style="padding:12px 16px;text-align:center">Supplements / Skincare</th>
            <th style="padding:12px 16px;text-align:center;color:#16C79A">Travel (VortexTrips)</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#f9f9f9"><td style="padding:10px 16px">Universal demand</td><td style="padding:10px 16px;text-align:center">Niche</td><td style="padding:10px 16px;text-align:center;color:#16C79A;font-weight:700">Everyone travels</td></tr>
          <tr><td style="padding:10px 16px">Demo-able instantly</td><td style="padding:10px 16px;text-align:center">Takes weeks to show results</td><td style="padding:10px 16px;text-align:center;color:#16C79A;font-weight:700">Show price gap in 30 seconds</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:10px 16px">Emotional appeal</td><td style="padding:10px 16px;text-align:center">Medium</td><td style="padding:10px 16px;text-align:center;color:#16C79A;font-weight:700">High — vacations are dreams</td></tr>
          <tr><td style="padding:10px 16px">Recurring spend</td><td style="padding:10px 16px;text-align:center">Monthly product order</td><td style="padding:10px 16px;text-align:center;color:#16C79A;font-weight:700">Annual membership renewal</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:10px 16px">Content creation</td><td style="padding:10px 16px;text-align:center">Hard to make interesting</td><td style="padding:10px 16px;text-align:center;color:#16C79A;font-weight:700">Travel photos = viral content</td></tr>
        </tbody>
      </table>
      <p>The window to get in early on a product like this doesn't stay open forever. Our SBA program is growing fast.</p>
      ${ctaButton('Reserve Your SBA Spot →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Day 15 — Hard close.
  mlmDay15: (firstName: string) => ({
    subject: `${firstName} — last note from me for a while`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">I'll keep this short, ${firstName}.</h2>
      <p>I've shared the product. I've shown the earnings. I've given you the full picture.</p>
      <p>If the timing isn't right, I completely respect that. But before I stop following up, I want to leave you with one question:</p>
      ${savingsBadge('"What would it mean to have a business where the product sells itself?"')}
      <p>That's what VortexTrips is for our best affiliates. Not hype. Not promises. Just a product with obvious, demonstrable, immediate value — in an industry (travel) that people already spend thousands on every year.</p>
      <p>When you're ready — whether that's next week or next year — the SBA program will still be here.</p>
      ${ctaButton('Join as an SBA →', `${BASE_URL}/sba`)}
      <p>If you want to unsubscribe from these emails, just reply "unsubscribe" and I'll remove you immediately.</p>
      <p style="color:#888;font-size:14px">Wishing you success wherever your business takes you.<br><br><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // ─── MLM LONG-TERM MONTHLY NURTURE ────────────────────────────────────────

  // Month 1 (Day 30) — Soft re-engagement. New angle.
  mlmMonth1: (firstName: string) => ({
    subject: `${firstName} — one travel deal worth seeing this month`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Hey ${firstName} — checking in with something real.</h2>
      <p>I know you're busy. I'm not going to pitch you on the business today.</p>
      <p>I just wanted to share what members are getting access to right now:</p>
      <div style="background:#1A1A2E;border-radius:12px;padding:20px 24px;margin:20px 0;color:white">
        <p style="margin:0 0 12px;font-weight:700;color:#FF6B35">🏖️ This month's member highlight</p>
        <p style="margin:0 0 8px;font-size:15px">Cancún all-inclusive, 5 nights for 2 — <strong style="color:#16C79A">$1,380 member rate</strong> vs $2,950 on Expedia</p>
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.7)">That's $1,570 saved on one trip.</p>
      </div>
      <p>If you travel at all — even once a year — the membership pays for itself in one night. And if you share it with two people who travel, your membership is free.</p>
      ${ctaButton('See Member Rates →', `${BASE_URL}/destinations/cancun`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Month 2 (Day 60) — Results-focused. Real member win.
  mlmMonth2: (firstName: string) => ({
    subject: `${firstName} — a member just saved $3,200 on their honeymoon`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">This happened last week, ${firstName}.</h2>
      <p>A VortexTrips member just booked their honeymoon in Paris. Here's what the numbers looked like:</p>
      <div style="background:#f9f9f9;border-radius:12px;padding:20px;margin:20px 0">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee"><span style="color:#666">Hotel (5 nights, 4-star)</span><span style="color:#16C79A;font-weight:700">Saved $1,980</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee"><span style="color:#666">Flights (consolidator rates)</span><span style="color:#16C79A;font-weight:700">Saved $840</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0"><span style="color:#666">Activities bundle</span><span style="color:#16C79A;font-weight:700">Saved $380</span></div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:8px;border-top:2px solid #1A1A2E"><span style="font-weight:700;color:#1A1A2E">Total savings</span><span style="font-weight:900;color:#16C79A;font-size:18px">$3,200</span></div>
      </div>
      <p>That's someone's honeymoon that cost $3,200 less than it would have on Booking.com. Their membership paid for itself <strong>8 times over</strong> on one trip.</p>
      <p>That's the story you tell your network, ${firstName}. You don't have to sell — you just share the receipt.</p>
      ${ctaButton('Start Sharing + Earning →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Month 3 (Day 90) — Quarter check-in. FOMO angle.
  mlmMonth3: (firstName: string) => ({
    subject: `${firstName} — 3 months of savings you could have had`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">3 months. Here's what members saved, ${firstName}.</h2>
      <p>Since we first connected, VortexTrips members have collectively saved over <strong>$800,000</strong> on travel.</p>
      <p>I don't say that to make you feel like you missed out — I say it because the window is still open.</p>
      ${savingsBadge('Every month you wait is another month of full retail prices.')}
      <p>The SBA program is still growing. Our affiliates who started 3 months ago are seeing consistent results. The ones who waited are starting from zero.</p>
      <p>I'm not going to oversell this. But I do want to make sure you have the full picture before you decide this isn't for you:</p>
      <ul style="padding-left:20px;color:#444">
        <li style="margin-bottom:8px">Product that sells itself (provable savings in 30 seconds)</li>
        <li style="margin-bottom:8px">Residual income from annual membership renewals</li>
        <li style="margin-bottom:8px">No inventory, no shipping, no explaining</li>
        <li style="margin-bottom:8px">Travel content = the easiest social media in any niche</li>
      </ul>
      ${ctaButton('Get Started Today →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Month 4 (Day 120) — Seasonal/timely. Spring/summer travel push.
  mlmMonth4: (firstName: string) => ({
    subject: `${firstName} — summer travel season is coming. Are you ready?`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Summer is the biggest travel season of the year, ${firstName}.</h2>
      <p>Every year, millions of families spend thousands more than they need to on summer vacations — because they don't know member rates exist.</p>
      <p>That's your market. Those are your potential customers.</p>
      <div style="background:#FF6B35/10;border:2px solid #FF6B35;border-radius:12px;padding:20px;margin:20px 0;background:rgba(255,107,53,0.08)">
        <p style="margin:0 0 8px;font-weight:700;color:#FF6B35">The summer opportunity:</p>
        <p style="margin:0;color:#444">When someone is actively planning a summer trip — they are <em>already motivated to buy</em>. You're not creating demand. You're just redirecting their existing spend to a better source.</p>
      </div>
      <p>The affiliates making the most right now are posting summer deal comparisons. Cancún. Caribbean. Orlando. Vegas. Every destination is a post. Every post is a potential signup.</p>
      <p>Get set up now before peak season hits.</p>
      ${ctaButton('Join as an SBA Before Summer →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Month 5 (Day 150) — Value re-anchor. New testimonial angle.
  mlmMonth5: (firstName: string) => ({
    subject: `${firstName} — this post got 47 DMs in 24 hours`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">One screenshot. 47 DMs. ${firstName}, this is the content strategy.</h2>
      <p>One of our SBAs posted a side-by-side hotel comparison on Instagram last week. Same hotel. Same dates. $1,800 difference.</p>
      <p>47 people DMed asking how to get access. She didn't pitch anyone. She just showed the math.</p>
      <p><strong>That's it.</strong> That's the entire business model in one post.</p>
      <p>People are already talking about travel. They're already planning trips. They're already spending the money. The only question is: are they spending it at retail or at member rates?</p>
      <p>When you're an SBA, every time someone in your network books a trip — you have a reason to reach out. A value-add that costs you nothing.</p>
      ${ctaButton('Become an SBA →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px">You've been on my list for a while now, ${firstName}. I respect your time. I'll keep sending you value — and when the timing is right, I'll be here.<br><br><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // Month 6 (Day 180) — The final long-term touch. Respect + open door.
  mlmMonth6: (firstName: string) => ({
    subject: `6 months, ${firstName}. Still here when you're ready.`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Hey ${firstName} — 6 months. I want to say something real.</h2>
      <p>You've been on my list for half a year. I respect that you're thoughtful about what you put your time and name behind.</p>
      <p>I'm not going to pressure you. But I do want to leave you with this:</p>
      ${savingsBadge('The best time to start was 6 months ago. The second best time is today.')}
      <p>Our SBAs who started when you first heard from me? Some of them have built real residual income. The product is the same. The opportunity is the same. The only difference is they started.</p>
      <p>If you ever want to have a real conversation about whether this makes sense for you — just reply to this email. No pitch. No pressure. Just a straight answer to whatever questions you have.</p>
      ${ctaButton('See the SBA Program →', `${BASE_URL}/sba`)}
      <p style="color:#888;font-size:14px">Whatever you decide, ${firstName} — thank you for your time and attention. I hope your travel plans and your business are both thriving.<br><br><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

  // ─── POST-TRIP REVIEW REQUEST ─────────────────────────────────────────────

  reviewRequestEmail: (firstName: string, destination?: string) => ({
    subject: `How was your${destination ? ` ${destination}` : ''} trip, ${firstName}? (60-second review)`,
    html: wrapper(`
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:900">Welcome back, ${firstName}! How was the trip? ✈️</h2>
      <p>We hope your${destination ? ` ${destination}` : ''} trip was everything you dreamed of. Your feedback helps thousands of other travelers plan smarter — and keeps our members-only rates sharp.</p>
      <p>It takes less than 60 seconds:</p>
      ${ctaButton('Leave My Review →', `${BASE_URL}/reviews`)}
      <p style="color:#888;font-size:13px">Did you save money compared to what you'd have paid elsewhere? Include your savings amount — members love seeing real numbers.</p>
      <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
    `),
  }),

}

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATES
