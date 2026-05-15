import Link from 'next/link'
import Footer from '@/components/Footer'

export const metadata = {
  title: "Terms & Conditions — VortexTrips",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#1A1A2E] px-6 py-4">
        <Link href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-[#1A1A2E] mb-4">Terms &amp; Conditions</h1>
        <p className="text-gray-500 mb-10">Last updated: May 15, 2026</p>

        <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using VortexTrips (operated by Travel Team Perks), you agree to be bound by these Terms &amp; Conditions. If you do not agree, please do not use our services.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">2. SMS / Text Messaging Program Terms</h2>
            <p className="mb-3"><strong>Program Name:</strong> VortexTrips SMS Program</p>
            <p className="mb-3"><strong>Program Description:</strong> By providing your mobile phone number and opting in to receive SMS messages from VortexTrips, you agree to receive recurring marketing, transactional, and account-related text messages, including but not limited to: account confirmation, scheduled travel consultation reminders, booking updates, support responses, and occasional travel deal notifications.</p>
            <p className="mb-3"><strong>How to Opt In:</strong> Opt in by entering your phone number on <a href="https://www.vortextrips.com" className="text-[#FF6B35] hover:underline">https://www.vortextrips.com</a> and checking the SMS consent box. Consent is not a condition of any purchase.</p>
            <p className="mb-3"><strong>How to Opt Out:</strong> Reply <strong>STOP</strong> to any message at any time to cancel. After replying STOP, you will receive a confirmation message and no further SMS messages will be sent unless you re-subscribe.</p>
            <p className="mb-3"><strong>Help / Support:</strong> Reply <strong>HELP</strong> to any message for support, or contact <a href="mailto:support@vortextrips.com" className="text-[#FF6B35] hover:underline">support@vortextrips.com</a>.</p>
            <p className="mb-3"><strong>Message Frequency:</strong> Message frequency varies. You may receive up to several messages per week depending on your account activity.</p>
            <p className="mb-3"><strong>Message and Data Rates:</strong> Msg &amp; data rates may apply. Carriers are not liable for delayed or undelivered messages.</p>
            <p className="mb-3"><strong>Supported Carriers:</strong> AT&amp;T, T-Mobile, Verizon Wireless, Sprint, U.S. Cellular, MetroPCS, Boost, Cricket, and other major U.S. carriers. T-Mobile is not liable for delayed or undelivered messages.</p>
            <p><strong>Privacy:</strong> Your information is governed by our <a href="/privacy" className="text-[#FF6B35] hover:underline">Privacy Policy</a>, which explicitly states that no mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">TikTok Integration</h2>
            <p className="mb-3">VortexTrips uses TikTok&apos;s Login Kit and Content Posting API to let you publish travel content from your VortexTrips dashboard directly to your TikTok account. By connecting your TikTok account, you agree to <a href="https://www.tiktok.com/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-[#FF6B35] hover:underline">TikTok&apos;s Terms of Service</a>.</p>
            <p>VortexTrips will only post to TikTok at your explicit request — every post requires you to click a clearly labeled &quot;Post to TikTok&quot; button in your dashboard. We do not auto-post or schedule posts without your action. To disconnect your TikTok account, contact <a href="mailto:support@vortextrips.com" className="text-[#FF6B35] hover:underline">support@vortextrips.com</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">3. Membership &amp; Services</h2>
            <p className="mb-3">VortexTrips provides access to exclusive member rates on hotels, flights, vacation packages, and travel services through our Travel Team Perks membership program. Actual savings vary based on destination, travel dates, and availability.</p>
            <p>Membership benefits are for personal use only and may not be transferred or resold.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">4. Savings Disclaimer</h2>
            <p>Savings percentages (40–60%) represent estimates based on comparison to standard retail rates at the time of booking. Actual savings may vary. VortexTrips does not guarantee specific savings amounts for any particular trip.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">5. User Obligations</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>You must be 18 years of age or older to use our services.</li>
              <li>You agree to provide accurate and complete information when signing up.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You agree not to use our services for any unlawful purpose.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">6. Cancellation Policy</h2>
            <p>Members may cancel their membership at any time by contacting support@vortextrips.com. Cancellation takes effect at the end of the current billing period. No partial refunds are issued for unused membership time.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">7. Limitation of Liability</h2>
            <p>VortexTrips and Travel Team Perks are not responsible for any direct, indirect, incidental, or consequential damages arising from use of our services, travel bookings, or third-party travel providers.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">8. Privacy</h2>
            <p>Your use of our services is also governed by our <a href="/privacy" className="text-[#FF6B35] hover:underline">Privacy Policy</a>, which is incorporated into these Terms by reference.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">9. Changes to Terms</h2>
            <p>We reserve the right to modify these Terms at any time. We will notify you of material changes via email or by posting an update on this page. Continued use of our services after changes constitutes acceptance of the revised Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">10. Contact Us</h2>
            <p>Questions about these Terms? Contact us at <a href="mailto:support@vortextrips.com" className="text-[#FF6B35] hover:underline">support@vortextrips.com</a></p>
            <p className="mt-2 text-gray-600">VortexTrips / Travel Team Perks</p>
          </section>
        </div>

        <p className="mt-8 text-center">
          <Link href="/" className="text-gray-500 hover:text-gray-700 transition-colors">← Back to VortexTrips</Link>
        </p>
      </div>

      <Footer />
    </div>
  )
}
