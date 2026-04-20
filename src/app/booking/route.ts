import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.redirect(
    'https://travmanity.com/Page/Home/wa=leosp?FpSubAffiliate=TM1705228',
    { status: 302 }
  )
}
