'use client'

import { useEffect } from 'react'

export default function BookingPage() {
  useEffect(() => {
    window.location.replace('https://travmanity.com/Page/Home/wa=leosp?FpSubAffiliate')
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <p>Redirecting to booking...</p>
    </div>
  )
}
