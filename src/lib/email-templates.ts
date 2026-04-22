const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.vortextrips.com'

function wrapper(content: string): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:#FF6B35;padding:20px 28px;display:flex;align-items:center">
    <span style="font-size:22px;font-weight:900;color:white;letter-spacing:-0.5px">Vortex<span style="color:#1A1A2E">Trips</span></span>
    <span style="color:rgba(255,255,255,0.75);font-size:12px;margin-left:8px">/ Travel Team Perks</span>
  </div>
  <div style="padding:32px 28px;color:#1A1A2E;line-height:1.7">
    ${content}
  </div>
  <div style="background:#f9f9f9;padding:20px 28px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center">
    <p style="margin:0 0 6px">VortexTrips / Travel Team Perks &nbsp;·&nbsp; <a href="${BASE_URL}" style="color:#FF6B35;text-decoration:none">vortextrips.com</a></p>
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
