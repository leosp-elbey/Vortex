export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#1A1A2E] px-6 py-4">
        <a href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></a>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-[#1A1A2E] mb-4">Privacy Policy</h1>
        <p className="text-gray-500 mb-10">Last updated: April 20, 2026</p>

        <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">1. Information We Collect</h2>
            <p>When you sign up or request a quote on VortexTrips, we collect:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
              <li>Your name, email address, and phone number</li>
              <li>Trip preferences (destination, dates, budget, travelers)</li>
              <li>How you found us (source/referral)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>To contact you about your travel savings inquiry via phone and email</li>
              <li>To generate personalized travel savings quotes using AI</li>
              <li>To notify you about exclusive deals relevant to your saved destinations</li>
              <li>To manage your membership if you join Travel Team Perks</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">3. Phone Calls & Automated Messaging</h2>
            <p>By providing your phone number, you consent to receive calls (including AI-assisted calls) and text messages from VortexTrips regarding your travel inquiry. You may opt out at any time by replying STOP or contacting us at support@vortextrips.com.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">4. Data Sharing</h2>
            <p>We do not sell your personal information. We share data only with service providers necessary to operate our platform (AI call services, email delivery). These providers are bound by confidentiality agreements.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">5. Data Retention</h2>
            <p>We retain your information for as long as your account is active or as needed to provide services. You may request deletion of your data at any time by emailing support@vortextrips.com.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">6. Security</h2>
            <p>We use industry-standard encryption and security measures to protect your data. Your information is stored securely in our database and is only accessible to authorized staff.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">7. Contact Us</h2>
            <p>Questions about this policy? Contact us at <a href="mailto:support@vortextrips.com" className="text-[#FF6B35] hover:underline">support@vortextrips.com</a></p>
          </section>
        </div>

        <p className="mt-8 text-center">
          <a href="/" className="text-gray-500 hover:text-gray-700 transition-colors">← Back to VortexTrips</a>
        </p>
      </div>
    </div>
  )
}
