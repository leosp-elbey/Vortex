import type { MetadataRoute } from 'next'

const BASE = 'https://www.vortextrips.com'

const STATIC_PATHS = [
  { path: '', priority: 1.0, changeFreq: 'weekly' as const },
  { path: '/sba', priority: 0.9, changeFreq: 'weekly' as const },
  { path: '/quote', priority: 0.8, changeFreq: 'weekly' as const },
  { path: '/quiz', priority: 0.7, changeFreq: 'monthly' as const },
  { path: '/reviews', priority: 0.7, changeFreq: 'weekly' as const },
  { path: '/join', priority: 0.7, changeFreq: 'monthly' as const },
  { path: '/thank-you', priority: 0.3, changeFreq: 'yearly' as const },
  { path: '/privacy', priority: 0.2, changeFreq: 'yearly' as const },
  { path: '/terms', priority: 0.2, changeFreq: 'yearly' as const },
  { path: '/data-deletion', priority: 0.1, changeFreq: 'yearly' as const },
]

const DESTINATIONS = ['cancun', 'paris', 'bali', 'maldives', 'tulum', 'rome', 'tokyo', 'london']

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map(({ path, priority, changeFreq }) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: changeFreq,
    priority,
  }))

  const destinationEntries: MetadataRoute.Sitemap = DESTINATIONS.map(slug => ({
    url: `${BASE}/destinations/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...staticEntries, ...destinationEntries]
}
