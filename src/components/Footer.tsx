import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-[#0d0d1a] text-gray-500 py-10 px-6 text-center text-sm">
      <div className="max-w-5xl mx-auto">
        <p className="text-white font-bold text-lg mb-2">VortexTrips</p>
        <div className="flex justify-center gap-6 mb-4 flex-wrap">
          <Link href="/quiz" className="hover:text-white transition-colors">Travel Quiz</Link>
          <Link href="/destinations/cancun" className="hover:text-white transition-colors">Destinations</Link>
          <Link href="/reviews" className="hover:text-white transition-colors">Member Reviews</Link>
          <Link href="/quote" className="hover:text-white transition-colors">Get a Quote</Link>
          <Link href="/join" className="hover:text-white transition-colors">Join Now</Link>
          <a href="mailto:support@vortextrips.com" className="hover:text-white transition-colors">Contact / Support</a>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
        </div>
        <p className="mb-2">1595 Palm Bay Rd #1009, Palm Bay, FL 32905</p>
        <p>© {new Date().getFullYear()} VortexTrips. All rights reserved.</p>
        <p className="mt-2 text-xs text-gray-600">Savings vary based on destination, travel dates, and availability. Member savings are estimates based on comparison to standard retail rates.</p>
      </div>
    </footer>
  )
}
