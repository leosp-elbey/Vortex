import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const { email, priceId } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const stripePriceId = priceId || process.env.STRIPE_PRICE_ID || ''
    if (!stripePriceId) {
      return NextResponse.json({ error: 'No price configured. Set STRIPE_PRICE_ID in .env.local' }, { status: 500 })
    }

    const url = await createCheckoutSession(email, stripePriceId)
    return NextResponse.json({ url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
