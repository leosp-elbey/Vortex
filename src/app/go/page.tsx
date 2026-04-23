export default function BookNowPage() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#1A1A2E', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ padding: '16px 24px' }}>
        <a href="/" style={{ fontSize: '22px', fontWeight: 900, color: 'white', textDecoration: 'none' }}>
          Vortex<span style={{ color: '#FF6B35' }}>Trips</span>
        </a>
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
        <div style={{ maxWidth: '500px', width: '100%' }}>

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✈️</div>
            <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'white', margin: '0 0 12px' }}>
              You&apos;re Almost at the Booking Portal
            </h1>
            <p style={{ color: '#ccc', fontSize: '16px', margin: 0 }}>
              Read this first — it takes 10 seconds and makes sure your discounts are applied.
            </p>
          </div>

          <div style={{ background: '#FF6B35', borderRadius: '16px', padding: '24px', textAlign: 'center', marginBottom: '24px' }}>
            <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 12px' }}>
              ⚠️ You MUST enter this referral code
            </p>
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px 32px', display: 'inline-block', marginBottom: '12px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: '#1A1A2E', letterSpacing: '4px' }}>leosp</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', margin: 0 }}>
              Enter this code when creating your account or at checkout.
            </p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ color: 'white', fontWeight: 700, fontSize: '17px', margin: '0 0 16px' }}>Why this code matters:</h2>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <span>✅</span>
              <p style={{ color: '#ccc', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>Your member discount gets applied — without the code you see standard public rates, not our exclusive pricing.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <span>✅</span>
              <p style={{ color: '#ccc', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>Your account links to VortexTrips so our team can support your bookings.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <span>✅</span>
              <p style={{ color: '#ccc', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>Every purchase is tracked so you get the right savings and Leo gets credit.</p>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
            <h2 style={{ color: 'white', fontWeight: 700, fontSize: '17px', margin: '0 0 16px' }}>Steps:</h2>
            {['Click the button below to open the booking site', 'When asked for a referral or affiliate code, enter: leosp', 'Create your account and browse member-only rates', 'Book your trip at up to 60% off retail prices'].map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: i < 3 ? '12px' : 0 }}>
                <span style={{ background: '#FF6B35', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', flexShrink: 0 }}>{i + 1}</span>
                <p style={{ color: '#ccc', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>{step}</p>
              </div>
            ))}
          </div>

          <a
            href="https://travmanity.com/Page/Home/wa=leosp?FpSubAffiliate"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', width: '100%', background: '#16C79A', color: 'white', fontWeight: 900, fontSize: '18px', padding: '20px', borderRadius: '16px', textAlign: 'center', textDecoration: 'none', marginBottom: '16px', boxSizing: 'border-box' }}
          >
            Go to Booking Site — Code: leosp →
          </a>

          <p style={{ textAlign: 'center', color: '#666', fontSize: '13px' }}>
            Questions? <a href="mailto:support@vortextrips.com" style={{ color: '#FF6B35' }}>support@vortextrips.com</a>
          </p>
        </div>
      </div>
    </div>
  )
}
