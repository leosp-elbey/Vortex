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
  | 'anchor'
  | 'bell'
  | 'check'
  | 'star'

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
  anchor: ['M12 22V8', 'M5 12H2a10 10 0 0 0 20 0h-3', 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  check: ['M20 6 9 17l-5-5'],
  star: ['M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.1 6.5L12 18.9l-5.8 3.1 1.1-6.5L2.5 9.4l6.6-1z'],
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
