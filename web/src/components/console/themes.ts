export interface ConsoleTheme {
  id: string
  code: string
  name: string
  body: string
  back?: string
  ambient?: string
  skin?: string
  clear?: boolean
  metallic?: boolean
  knob: string
  main: string
  action: string
  pills: string
  glow?: string
  bezelInk?: string
  label?: string
  logo?: string
  logoEyes?: string
  cardBg: string
  cardInk: string
  cardSub: string
  cardImage?: string
}

export const DEFAULT_THEME: ConsoleTheme = {
  id: 'pumpy-lime',
  code: '001',
  name: 'Pumpy Lime',
  body: '#171d21',
  back: '#101518',
  ambient: '#070d0b',
  knob: '#b8ff4a',
  main: '#b8ff4a',
  action: '#252f34',
  pills: '#252f34',
  glow: '#58dbff',
  bezelInk: '#b8ff4a',
  label: '#8fa0a7',
  logo: '#b8ff4a',
  logoEyes: '#58dbff',
  cardBg: '#171d21',
  cardInk: '#b8ff4a',
  cardSub: 'rgba(232,240,244,0.66)',
}

export function themeBackdrop(theme: ConsoleTheme): string {
  return theme.ambient ?? '#07090f'
}
