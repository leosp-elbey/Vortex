interface Props {
  searchParams: Promise<{ from?: string }>
}

export default async function ThankYouPage({ searchParams }: Props) {
  const params = await searchParams
  const from = params.from || 'lead'
  const isQuote = from === 'quote'

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="text-6xl mb-6">{isQuote ? '📧' : '📞'}</div>
        <h1 className="text-4xl font-black text-white mb-4">
          {isQuote ? 'Your Quote Is On Its Way!' : "You're In! Get Ready."}
        </h1>
        <p className="text-xl text-gray-300 mb-6 leading-relaxed">
          {isQuote ? (
            <>
              We&apos;re generating your personalized savings breakdown for{' '}
              <strong className="text-[#FF6B35]">your trip</strong> right now.
              Check your inbox — it arrives within 2 minutes.
            </>
          ) : (
            <>
              <strong className="text-[#FF6B35]">Maya</strong> from our VortexTrips team
              will call you in the next few minutes to walk you through your exclusive member savings.
            </>
          )}
        </p>

        <div className="bg-white/10 rounded-xl p-6 mb-8 text-left space-y-3">
          <p className="text-white font-semibold">
            {isQuote ? 'What happens next:' : 'While you wait:'}
          </p>
          {isQuote ? (
            <>
              <div className="flex items-start gap-3 text-gray-300">
                <span className="text-[#16C79A] text-xl">✓</span>
                <span>Check your email — your personalized travel savings quote is arriving now</span>
              </div>
              <div className="flex items-start gap-3 text-gray-300">
                <span className="text-[#16C79A] text-xl">✓</span>
                <span>Review your exact savings estimate based on your destination and budget</span>
              </div>
              <div className="flex items-start gap-3 text-gray-300">
                <span className="text-[#16C79A] text-xl">✓</span>
                <span>Ready to join? Click the link in your email to lock in your membership rate</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 text-gray-300">
                <span className="text-[#16C79A] text-xl">✓</span>
                <span>Answer the call — it&apos;s Maya from our team, not a robot</span>
              </div>
              <div className="flex items-start gap-3 text-gray-300">
                <span className="text-[#16C79A] text-xl">✓</span>
                <span>Tell her where you want to go — she&apos;ll show you exactly how much you can save</span>
              </div>
              <div className="flex items-start gap-3 text-gray-300">
                <span className="text-[#16C79A] text-xl">✓</span>
                <span>Members save $1,200+ on their first trip alone</span>
              </div>
            </>
          )}
        </div>

        {!isQuote && (
          <a
            href="/quote"
            className="inline-block bg-[#FF6B35] text-white font-bold py-4 px-8 rounded-xl text-lg hover:bg-[#e55a25] transition-colors mb-4"
          >
            Get a Trip Quote by Email →
          </a>
        )}

        {isQuote && (
          <a
            href="/join"
            className="inline-block bg-[#FF6B35] text-white font-bold py-4 px-8 rounded-xl text-lg hover:bg-[#e55a25] transition-colors mb-4"
          >
            Join Travel Team Perks →
          </a>
        )}

        <p className="text-gray-500 text-sm mt-2">
          <a href="/" className="hover:text-gray-300 transition-colors">← Back to home</a>
        </p>
      </div>
    </div>
  )
}
