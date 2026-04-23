interface Props {
  searchParams: Promise<{ from?: string }>
}

export default async function ThankYouPage({ searchParams }: Props) {
  const params = await searchParams
  const from = params.from || 'lead'
  const isSBA = from === 'sba'
  const isQuote = from === 'quote'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#0F3460] flex flex-col">
      <nav className="px-6 py-4">
        <a href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></a>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-xl text-center">
          <div className="text-6xl mb-6">{isSBA ? '🎉' : '📞'}</div>

          <h1 className="text-4xl font-black text-white mb-4">
            {isSBA
              ? 'Welcome to the Team!'
              : isQuote
              ? 'Your Quote Is On Its Way!'
              : "You're In — Watch Your Phone!"}
          </h1>

          <p className="text-xl text-gray-300 mb-6 leading-relaxed">
            {isSBA
              ? 'Your Smart Business Affiliate account is active. Check your inbox — your welcome kit and affiliate links are on the way.'
              : isQuote
              ? 'Your personalized savings breakdown is being generated right now. Check your inbox — it arrives within 2 minutes.'
              : 'Our AI travel consultant is calling you within 60 seconds with your personalized savings breakdown. Pick up!'}
          </p>

          <div className="bg-white/10 rounded-2xl p-6 mb-8 text-left space-y-4">
            <p className="text-[#FF6B35] font-bold text-sm uppercase tracking-wide">What happens next</p>
            {isSBA ? (
              <>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">1.</span><span>Check your email for your affiliate links and onboarding guide</span></div>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">2.</span><span>Share your link on social media to start earning commissions</span></div>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">3.</span><span>We'll follow up with training tips over the next 7 days</span></div>
              </>
            ) : isQuote ? (
              <>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">1.</span><span>Check your email — your savings comparison is arriving now</span></div>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">2.</span><span>Review your exact savings for your destination and dates</span></div>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">3.</span><span>Reply to the email with any questions — we respond fast</span></div>
              </>
            ) : (
              <>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">1.</span><span>Answer the call — your AI travel consultant has your quote ready</span></div>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">2.</span><span>Check your email — your full savings breakdown arrives within 2 minutes</span></div>
                <div className="flex gap-3 text-gray-300"><span className="text-[#16C79A] font-black shrink-0">3.</span><span>Access your member rates and book at up to 60% off retail</span></div>
              </>
            )}
          </div>

          <p className="text-gray-400 text-sm mb-8">
            Questions? Email us at{' '}
            <a href="mailto:support@vortextrips.com" className="text-[#FF6B35] underline">support@vortextrips.com</a>
          </p>

          <div className="flex flex-col gap-3 justify-center max-w-sm mx-auto">
            <a
              href="https://myvortex365.com/leosp"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#16C79A] text-white font-black px-6 py-4 rounded-xl hover:bg-emerald-500 transition-colors text-center text-lg"
            >
              ✅ Create My Free Savings Account →
            </a>
            <a
              href="/go"
              className="bg-[#FF6B35] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#e55a25] transition-colors text-center"
            >
              Book a Trip Now →
            </a>
            <a href="/" className="bg-white/10 text-white font-bold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors text-center">
              ← Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
