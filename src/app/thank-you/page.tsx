export default function ThankYouPage() {
  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="text-6xl mb-6">📞</div>
        <h1 className="text-4xl font-black text-white mb-4">
          You&apos;re In! Get Ready.
        </h1>
        <p className="text-xl text-gray-300 mb-6 leading-relaxed">
          <strong className="text-[#FF6B35]">Maya</strong> from our VortexTrips team will call you in the next few minutes to help you start saving on your next trip.
        </p>
        <div className="bg-white/10 rounded-xl p-6 mb-8 text-left space-y-3">
          <p className="text-white font-semibold">While you wait:</p>
          <div className="flex items-start gap-3 text-gray-300">
            <span className="text-[#16C79A] text-xl">✓</span>
            <span>Check your email — your personalized savings quote is on its way</span>
          </div>
          <div className="flex items-start gap-3 text-gray-300">
            <span className="text-[#16C79A] text-xl">✓</span>
            <span>Answer the call — it&apos;s worth it. Members save $1,200+ on their first trip</span>
          </div>
          <div className="flex items-start gap-3 text-gray-300">
            <span className="text-[#16C79A] text-xl">✓</span>
            <span>Think about where you want to go — we&apos;ll get you there for less</span>
          </div>
        </div>
        <a
          href="/quote"
          className="inline-block bg-[#FF6B35] text-white font-bold py-4 px-8 rounded-xl text-lg hover:bg-[#e55a25] transition-colors"
        >
          Request a Trip Quote Now →
        </a>
        <p className="text-gray-500 text-sm mt-4">
          <a href="/" className="hover:text-gray-300 transition-colors">← Back to home</a>
        </p>
      </div>
    </div>
  )
}
