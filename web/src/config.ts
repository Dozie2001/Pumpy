// App-level brand and links. Deployment-specific DreamDEX values stay outside this file.

// Canonical prod origin. Only for places with no runtime origin to read (SSR meta tags), never as the
// base of a link the user copies, that follows the browser's own origin. See lib/referral.ts.
export const SITE_URL = import.meta.env.VITE_APP_URL || 'http://localhost:3200'

export const config = {
  appName: 'Pumpy',
  tagline: 'Markets, made playable.',
  description:
    'A mobile prediction arcade powered by DreamDEX Event Contracts on Somnia.',

  links: {
    twitter: 'https://x.com/',
    github: 'https://github.com/',
    docs: 'https://docs.dreamdex.io/developers/event-contracts',
    support: 'https://discord.gg/somnia',
  },
} as const

export type Config = typeof config
