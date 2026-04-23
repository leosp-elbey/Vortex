export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-[#1A1A2E] text-white">
      <nav className="px-6 py-4">
        <a href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></a>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black mb-4">Data Deletion Request</h1>
        <p className="text-gray-400 text-sm mb-10">Last updated: April 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">How to Request Data Deletion</h2>
            <p>
              If you have connected your Facebook or Instagram account to VortexTrips and wish to have your data deleted,
              you may submit a deletion request by emailing us at{' '}
              <a href="mailto:support@vortextrips.com" className="text-[#FF6B35] underline">support@vortextrips.com</a>{' '}
              with the subject line <strong className="text-white">"Data Deletion Request"</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">What We Delete</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Your name and email address</li>
              <li>Your phone number (if provided)</li>
              <li>Any travel preferences or quiz responses</li>
              <li>Communication history and sequence records</li>
              <li>Any data obtained through Facebook or Instagram login</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Processing Time</h2>
            <p>
              We will process your deletion request within <strong className="text-white">30 days</strong> of receipt
              and send a confirmation to your email address.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Contact</h2>
            <p>
              For questions about your data or this policy, contact us at{' '}
              <a href="mailto:support@vortextrips.com" className="text-[#FF6B35] underline">support@vortextrips.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
