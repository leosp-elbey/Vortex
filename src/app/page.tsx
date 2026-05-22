// Phase 14AT — Homepage rebuild.
//
// Server component. The form state previously lived inline in this file
// has been extracted to src/components/HomepageForm.tsx so this page can
// be statically rendered + carry its own metadata block.
//
// Above-fold: NEW headline + subheadline + HomepageForm (4 required fields
// + interest dropdown + 2 separate A2P-compliant SMS consent checkboxes).
//
// Below-fold: the new band (3 benefits + social-proof strip + secondary
// /join CTA) sits between the hero and the legacy sections (How It Works,
// Benefits grid, Testimonials, Destinations, Quiz CTA, Final CTA). All
// legacy sections are preserved verbatim — they are content the rest of
// the system feeds from (testimonial photos, destination links, etc.).
//
// Visual polish pass: emoji-as-icons replaced with the SVG <Icon> set,
// refined gradient hero overlay, consistent card hover states.

import Link from 'next/link'
import HomepageForm from '@/components/HomepageForm'
import ExitIntent from '@/components/ExitIntent'
import Footer from '@/components/Footer'
import { Icon, Stars, IconTile } from '@/components/Icon'

export const metadata = {
  title: 'VortexTrips — Search Member-Only Travel Prices',
  description: 'Get free access to wholesale hotel, flight, and package rates. No credit card required.',
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-[#1A1A2E] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-300">
          <Link href="/quiz" className="hover:text-white transition-colors">Travel Quiz</Link>
          <Link href="/destinations/cancun" className="hover:text-white transition-colors">Destinations</Link>
          <Link href="/reviews" className="hover:text-white transition-colors">Reviews</Link>
          <Link href="/sba" className="hover:text-white transition-colors">Earn With Us</Link>
        </div>
        <a href="https://myvortex365.com/leosp" target="_blank" rel="noopener noreferrer" className="bg-[#FF6B35] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#e55a25] transition-colors">
          Get Free Account
        </a>
      </nav>

      {/* Hero — Phase 14AT new copy + new HomepageForm */}
      <section
        id="hero-form"
        className="relative text-white py-20 px-6"
        style={{ backgroundImage: 'url(/hero-background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-[#1A1A2E]/95 via-[#1A1A2E]/80 to-[#0F3460]/60" />
        <div className="relative z-10 max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#16C79A]/15 ring-1 ring-[#16C79A]/30 text-[#16C79A] text-sm font-semibold px-3 py-1.5 rounded-full mb-6">
              <Icon name="plane" className="w-4 h-4" />
              Members save $1,200+ per trip on average
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-tight mb-6">
              Search Hotels, Flights &amp; Packages at <span className="gradient-text">Member-Only Prices</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              Get free access to wholesale travel rates. No credit card. No commitment.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm text-gray-200">
              {['No blackout dates', '500,000+ hotels worldwide', 'AI-powered deal matching', 'Personal travel consultant'].map(item => (
                <li key={item} className="flex items-center gap-2">
                  <Icon name="check" className="w-4 h-4 text-[#16C79A] shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-2">Start Saving for Free</h2>
            <p className="text-gray-600 mb-4 text-sm">Drop your info — we&apos;ll set up your free savings account and call you within minutes with your personalized rates.</p>
            <HomepageForm formId="hero-form-card" />
          </div>
        </div>
      </section>

      {/* Phase 14AT — NEW BAND: 3 benefits + social proof + secondary /join CTA */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-10 mb-12">
            <div className="text-center">
              <IconTile name="tag" tone="orange" className="w-14 h-14 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-[#1A1A2E] mb-2">Member-Only Pricing</h3>
              <p className="text-gray-600">Hotels up to 75% off retail.</p>
            </div>
            <div className="text-center">
              <IconTile name="gift" tone="teal" className="w-14 h-14 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-[#1A1A2E] mb-2">3 &amp; Free</h3>
              <p className="text-gray-600">Refer 3 members and your monthly fee is waived.</p>
            </div>
            <div className="text-center">
              <IconTile name="globe" tone="navy" className="w-14 h-14 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-[#1A1A2E] mb-2">Travel Anywhere</h3>
              <p className="text-gray-600">Hotels, flights, packages, cruises worldwide.</p>
            </div>
          </div>

          {/* Social proof strip */}
          <div className="bg-gray-50 rounded-2xl py-6 px-8 text-center mb-10">
            <Stars className="w-6 h-6 text-[#FF6B35] mb-1" />
            <p className="text-gray-700 font-semibold">Join 700+ members saving on every trip</p>
          </div>

          {/* Secondary CTA */}
          <div className="text-center">
            <p className="text-gray-600 mb-3">Already saving? Help others do the same.</p>
            <Link
              href="/join"
              className="inline-block border-2 border-[#FF6B35] text-[#FF6B35] font-bold px-8 py-3 rounded-xl hover:bg-[#FF6B35] hover:text-white transition-colors"
            >
              Join the Affiliate Program →
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <section className="bg-[#FF6B35] py-4 px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-x-8 gap-y-2 text-white text-sm font-semibold">
          {[
            { icon: 'star' as const, text: 'Members love it' },
            { icon: 'tag' as const, text: 'Save $1,200+ per trip on average' },
            { icon: 'bed' as const, text: '500,000+ hotels worldwide' },
            { icon: 'sparkles' as const, text: 'AI-powered deal matching' },
          ].map(({ icon, text }) => (
            <span key={text} className="flex items-center gap-2">
              <Icon name={icon} className="w-4 h-4" />
              {text}
            </span>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-black text-[#1A1A2E] mb-4">How It Works</h2>
          <p className="text-gray-600 text-lg mb-16">Three simple steps to your first massive savings</p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', icon: 'user-plus' as const, title: 'Create Free Account', desc: 'Sign up at myvortex365.com/leosp — takes 30 seconds, zero cost, no credit card ever required.' },
              { step: '02', icon: 'search' as const, title: 'Browse & Save', desc: 'Instantly access 500,000+ hotels, flights, and packages at wholesale member rates — 40-60% below retail.' },
              { step: '03', icon: 'briefcase' as const, title: 'Want to Earn Too?', desc: 'Share your link and earn commissions every time someone you refer books a trip. No quotas. No monthly fees.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="relative p-8 rounded-2xl border-2 border-gray-100 text-left hover:border-[#FF6B35] hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
                <div className="absolute top-4 right-5 text-6xl font-black text-gray-100 select-none">{step}</div>
                <IconTile name={icon} tone="orange" className="w-14 h-14 mb-4" />
                <h3 className="text-xl font-bold text-[#1A1A2E] mb-3">{title}</h3>
                <p className="text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-[#1A1A2E] mb-4">Everything Members Get</h2>
            <p className="text-gray-600 text-lg">Your all-access pass to the best travel deals on the planet</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: 'bed' as const, tone: 'orange' as const, title: 'Exclusive Hotel Rates', desc: 'Access to 500,000+ hotels at wholesale rates. Up to 60% below public booking sites.' },
              { icon: 'sparkles' as const, tone: 'teal' as const, title: 'AI-Powered Deal Matching', desc: 'Our AI scans millions of deals daily and alerts you when your dream destination goes on sale.' },
              { icon: 'user' as const, tone: 'orange' as const, title: 'Personal Travel Consultant', desc: 'A dedicated human + AI consultant handles research, bookings, and maximizes every dollar of your savings.' },
              { icon: 'plane' as const, tone: 'teal' as const, title: 'Members-Only Flight Deals', desc: 'Unpublished fare classes and consolidator rates that aren\'t available to the general public.' },
              { icon: 'anchor' as const, tone: 'orange' as const, title: 'Cruise & Resort Packages', desc: 'Bundle pricing on cruises and all-inclusive resorts at rates 40-50% below retail.' },
              { icon: 'bell' as const, tone: 'teal' as const, title: 'Deal Alerts & Notifications', desc: 'Get instant alerts when prices drop on your saved destinations. Never miss a deal again.' },
            ].map(({ icon, tone, title, desc }) => (
              <div key={title} className="flex gap-4 p-6 bg-white rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
                <IconTile name={icon} tone={tone} className="w-12 h-12 shrink-0" />
                <div>
                  <h3 className="font-bold text-[#1A1A2E] mb-1">{title}</h3>
                  <p className="text-gray-600 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-[#1A1A2E] mb-4">Real Members, Real Savings</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Jessica T.', location: 'Austin, TX', saved: '$1,847', trip: 'Cancún family trip', quote: 'I was skeptical at first, but we saved almost $2,000 on our family vacation compared to Expedia. The hotel alone was 52% cheaper. This membership paid for itself 10x over.', photo: '/testimonials/testimonial-jessica.jpg' },
              { name: 'Michelle R.', location: 'Atlanta, GA', saved: '$3,200', trip: 'Europe honeymoon', quote: 'VortexTrips found us a 5-star hotel in Paris for the price of a 3-star. Our entire honeymoon cost less than what most people spend on flights alone. Cannot recommend enough.', photo: '/testimonials/testimonial-michelle.jpg' },
              { name: 'Scott L.', location: 'Chicago, IL', saved: '$940', trip: 'Vegas weekend', quote: 'Called by Maya within a minute of signing up. She walked me through everything and got us a suite for $189/night that was listed at $389 everywhere else. Incredible service.', photo: '/testimonials/testimonial-scott.jpg' },
            ].map(({ name, location, saved, trip, quote, photo }) => (
              <div key={name} className="p-6 bg-gray-50 rounded-2xl hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
                <div className="flex items-center gap-3 mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- testimonial photo from /public; configuring next/image is out of scope */}
                  <img
                    src={photo}
                    alt={name}
                    className="w-12 h-12 rounded-full object-cover object-top flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-[#1A1A2E] whitespace-nowrap">{name}</p>
                      <p className="text-[#16C79A] font-black text-base whitespace-nowrap">Saved {saved}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-gray-500">{location}</p>
                      <p className="text-xs text-gray-400">{trip}</p>
                    </div>
                  </div>
                </div>
                <p className="text-gray-600 text-sm italic">&quot;{quote}&quot;</p>
                <Stars className="w-4 h-4 text-[#FF6B35] mt-3" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Destinations */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black text-[#1A1A2E] mb-4">Popular Destinations</h2>
            <p className="text-gray-600 text-lg">See exactly what members are saving on top trips</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { slug: 'cancun', name: 'Cancún', saved: 'Save up to 59%' },
              { slug: 'paris', name: 'Paris', saved: 'Save up to 50%' },
              { slug: 'vegas', name: 'Las Vegas', saved: 'Save up to 55%' },
              { slug: 'caribbean', name: 'Caribbean', saved: 'Save up to 52%' },
              { slug: 'orlando', name: 'Orlando', saved: 'Save up to 48%' },
            ].map(({ slug, name, saved }) => (
              <a
                key={slug}
                href={`/destinations/${slug}`}
                className="group block overflow-hidden rounded-xl bg-white shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- destination photo from /public; configuring next/image is out of scope */}
                  <img
                    src={`/destinations/${slug}.jpg`}
                    alt={`${name} travel destination`}
                    width={800}
                    height={600}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <p className="absolute bottom-2 left-3 font-bold text-white text-sm drop-shadow-md">{name}</p>
                </div>
                <p className="px-3 py-2.5 text-center text-xs text-[#16C79A] font-semibold">{saved}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Quiz CTA banner */}
      <section className="py-14 px-6 bg-[#FF6B35]">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black text-white mb-2">Not Sure Where to Go?</h2>
            <p className="text-white/80 text-lg">Take our 60-second travel quiz — we&apos;ll match you with the perfect destination and your best savings.</p>
          </div>
          <a
            href="/quiz"
            className="shrink-0 bg-white text-[#FF6B35] font-black px-8 py-4 rounded-xl text-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            Take the Quiz →
          </a>
        </div>
      </section>

      {/* Final CTA */}
      <section id="join-cta" className="py-20 px-6 bg-[#1A1A2E]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-black text-white mb-4">
            Start Saving for Free — Right Now
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            No credit card. No catch. Create your free account and start saving on your next trip in minutes.
          </p>
          <a
            href="https://myvortex365.com/leosp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#16C79A] hover:bg-emerald-500 text-white font-black text-xl px-12 py-5 rounded-2xl transition-all shadow-xl mb-6"
          >
            <Icon name="check" className="w-6 h-6" />
            Create My Free Account →
          </a>
          <p className="text-gray-500 text-sm mb-10">or leave your info below and we&apos;ll call you in 60 seconds</p>
          <div className="bg-white rounded-2xl p-8">
            <HomepageForm formId="cta-form" />
          </div>
          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-gray-400 mb-4">Want to earn commissions sharing travel deals?</p>
            <a href="/sba" className="inline-block border border-[#FF6B35] text-[#FF6B35] font-bold px-8 py-3 rounded-xl hover:bg-[#FF6B35] hover:text-white transition-colors">
              Learn About the SBA Opportunity →
            </a>
          </div>
        </div>
      </section>

      <Footer />

      <ExitIntent />
    </div>
  )
}
