// Lightweight inline SVG icon set (Lucide-derived paths).
//
// Replaces emoji used as structural icons across the marketing site.
// Emoji render inconsistently per-platform, can't be brand-colored, and
// read as unprofessional — SVG icons scale crisply and inherit currentColor.

import type { SVGProps } from 'react'

export type IconName =
  | 'plane'
  | 'tag'
  | 'gift'
  | 'globe'
  | 'user-plus'
  | 'search'
  | 'briefcase'
  | 'bed'
  | 'sparkles'
  | 'user'
  | 'users'
  | 'anchor'
  | 'bell'
  | 'check'
  | 'star'
  | 'shield'
  | 'phone'
  | 'mail'
  | 'play'
  | 'bar-chart'
  | 'repeat'
  | 'link'
  | 'smartphone'
  | 'graduation-cap'
  | 'message-circle'
  | 'target'
  | 'umbrella'
  | 'mountain'
  | 'landmark'
  | 'gem'
  | 'calendar'

const PATHS: Record<IconName, string[]> = {
  plane: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ],
  tag: [
    'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
    'M7.5 7.5h.01',
  ],
  gift: [
    'M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8',
    'M2 7h20v5H2z',
    'M12 22V7',
    'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z',
    'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  ],
  globe: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    'M2 12h20',
    'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  ],
  'user-plus': [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M19 8v6',
    'M22 11h-6',
  ],
  search: ['M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'm21 21-4.35-4.35'],
  briefcase: [
    'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
    'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  ],
  bed: ['M2 4v16', 'M2 8h18a2 2 0 0 1 2 2v10', 'M2 17h20', 'M6 8v9'],
  sparkles: [
    'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z',
    'M18.5 4.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  ],
  user: [
    'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2',
    'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  anchor: ['M12 22V8', 'M5 12H2a10 10 0 0 0 20 0h-3', 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  check: ['M20 6 9 17l-5-5'],
  star: ['M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.1 6.5L12 18.9l-5.8 3.1 1.1-6.5L2.5 9.4l6.6-1z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  phone: [
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  ],
  mail: [
    'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'm22 7-10 6L2 7',
  ],
  play: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'm10 8 6 4-6 4z'],
  'bar-chart': ['M3 3v18h18', 'M8 17V9', 'M13 17V5', 'M18 17v-6'],
  repeat: [
    'm17 2 4 4-4 4',
    'M3 11v-1a4 4 0 0 1 4-4h14',
    'm7 22-4-4 4-4',
    'M21 13v1a4 4 0 0 1-4 4H3',
  ],
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
  smartphone: [
    'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
    'M12 18h.01',
  ],
  'graduation-cap': [
    'M22 10 12 5 2 10l10 5 10-5z',
    'M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5',
    'M22 10v6',
  ],
  'message-circle': ['M7.9 20A9 9 0 1 0 4 16.1L2 22z'],
  target: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
    'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  ],
  umbrella: ['M12 12v8a2 2 0 0 0 4 0', 'M12 2v1', 'M22 12a10 10 0 0 0-20 0z'],
  mountain: ['m8 3 4 8 5-5 5 15H2z'],
  landmark: [
    'M3 22h18',
    'M6 18v-7',
    'M10 18v-7',
    'M14 18v-7',
    'M18 18v-7',
    'M3 10l9-6 9 6',
    'M3 10h18',
  ],
  gem: ['M6 3h12l4 6-10 13L2 9z', 'M2 9h20', 'm12 22 4-13-3-6', 'M12 22 8 9l3-6'],
  calendar: [
    'M8 2v4',
    'M16 2v4',
    'M4 6h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
    'M2 10h20',
  ],
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  className?: string
}

export function Icon({ name, className = 'w-6 h-6', ...rest }: IconProps) {
  const filled = name === 'star'
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

// 5-star rating row. Announced once to screen readers via aria-label.
export function Stars({
  className = 'w-5 h-5',
  label = 'Rated 5 out of 5 stars',
}: {
  className?: string
  label?: string
}) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon key={i} name="star" className={className} />
      ))}
    </span>
  )
}

// Brand-tinted rounded icon tile. Shared by the marketing pages.
export function IconTile({
  name,
  tone,
  className = 'w-14 h-14',
  iconClassName = 'w-7 h-7',
}: {
  name: IconName
  tone: 'orange' | 'teal' | 'navy'
  className?: string
  iconClassName?: string
}) {
  const tones = {
    orange: 'bg-[#FF6B35]/10 text-[#FF6B35]',
    teal: 'bg-[#16C79A]/10 text-[#16C79A]',
    navy: 'bg-[#1A1A2E]/10 text-[#1A1A2E]',
  }
  return (
    <div
      className={`flex items-center justify-center rounded-2xl ${tones[tone]} ${className}`}
    >
      <Icon name={name} className={iconClassName} />
    </div>
  )
}
