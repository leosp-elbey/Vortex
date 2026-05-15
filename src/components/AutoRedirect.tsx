'use client'

// Phase 14AT — small fire-and-forget client component that performs a
// delayed window.location redirect. Used by /thank-you to send users to
// the partner portal at https://vortextrips.com/free after a brief
// tracking window. Renders nothing.

import { useEffect } from 'react'

interface Props {
  to: string
  delayMs: number
}

export default function AutoRedirect({ to, delayMs }: Props) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = to
    }, delayMs)
    return () => clearTimeout(timer)
  }, [to, delayMs])
  return null
}
