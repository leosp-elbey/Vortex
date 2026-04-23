'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function BookingPage() {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText('leosp')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#1A1A2E] flex flex-col">
      <nav className="px-6 py-4">
        <Link href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">✈️</div>
            <h1 className="text-3xl font-black text-white mb-3">You're Almost at the Booking Portal</h1>
            <p className="text-gray-300 text-lg">Before you go — read this. It takes 10 seconds and makes sure your discounts are applied.</p>
          </div>

          {/* The code box — most important thing on the page */}
          <div className="bg-[#FF6B35] rounded-2xl p-6 mb-6 text-center shadow-xl">
            <p className="text-white font-bold text-sm uppercase tracking-widest mb-3">⚠️ You MUST enter this referral code</p>
            <div className="bg-white rounded-xl px-8 py-4 mb-4 inline-block">
              <span className="text-5xl font-black text-[#1A1A2E] tracking-widest">leosp</span>
            </div>
            <p className="text-white/90 text-sm">Enter this code when you create your account or at checkout on the Travmanity site.</p>
            <button
              onClick={handleCopy}
              className="mt-4 bg-white/20 hover:bg-white/30 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
            >
              {copied ? '✓ Copied!' : 'Copy Code'}
            </button>
          </div>

          {/* Why it matters */}
          <div className="bg-white/10 rounded-2xl p-6 mb-6 space-y-4">
            <h2 className="text-white font-bold text-lg">Why this code matters:</h2>
            <div className="flex gap-3">
              <span className="text-[#16C79A] text-xl flex-shrink-0">✓</span>
              <p className="text-gray-300 text-sm"><strong className="text-white">Your member discount gets applied</strong> — without the code, you see standard public rates, not our exclusive wholesale pricing.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-[#16C79A] text-xl flex-shrink-0">✓</span>
              <p className="text-gray-300 text-sm"><strong className="text-white">Your account is linked to VortexTrips</strong> — so our team can assist you with bookings and support.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-[#16C79A] text-xl flex-shrink-0">✓</span>
              <p className="text-gray-300 text-sm"><strong className="text-white">Any purchase is tracked correctly</strong> — ensuring you get credit and your savings are verified.</p>
            </div>
          </div>

          {/* Step-by-step */}
          <div className="bg-white/5 rounded-2xl p-6 mb-8">
            <h2 className="text-white font-bold mb-4">How to use the code on Travmanity:</h2>
            <ol className="space-y-3 text-sm text-gray-300">
              <li className="flex gap-3"><span className="bg-[#FF6B35] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-xs">1</span>Click the button below to open the booking site</li>
              <li className="flex gap-3"><span className="bg-[#FF6B35] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-xs">2</span>When asked for a referral/affiliate code, enter: <strong className="text-white ml-1">leosp</strong></li>
              <li className="flex gap-3"><span className="bg-[#FF6B35] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-xs">3</span>Create your account and start browsing member-only rates</li>
              <li className="flex gap-3"><span className="bg-[#FF6B35] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-xs">4</span>Book your trip at up to 60% off retail prices</li>
            </ol>
          </div>

          {/* CTA */}
          <a
            href="https://travmanity.com/Page/Home/wa=leosp?FpSubAffiliate"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-[#16C79A] hover:bg-emerald-500 text-white font-black text-xl py-5 rounded-2xl text-center transition-all shadow-xl mb-4"
          >
            Go to Booking Site — Code: leosp →
          </a>

          <p className="text-center text-gray-500 text-xs">
            You'll be taken to Travmanity.com — our trusted booking partner. Questions?{' '}
            <a href="mailto:support@vortextrips.com" className="text-[#FF6B35]">support@vortextrips.com</a>
          </p>
        </div>
      </div>
    </div>
  )
}
