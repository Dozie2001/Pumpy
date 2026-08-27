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

export const PUMPY_THEMES: ReadonlyArray<ConsoleTheme> = [
  DEFAULT_THEME,
  {
    id: 'pumpy-coral',
    code: '002',
    name: 'Hot Signal',
    body: '#22191d',
    back: '#140f12',
    ambient: '#11080c',
    knob: '#ff7c72',
    main: '#ff7c72',
    action: '#382329',
    pills: '#382329',
    glow: '#ffc857',
    bezelInk: '#ff9b92',
    label: '#b9a1a6',
    logo: '#ff7c72',
    logoEyes: '#ffc857',
    cardBg: '#22191d',
    cardInk: '#ff9b92',
    cardSub: 'rgba(244,224,229,0.66)',
  },
  {
    id: 'pumpy-glacier',
    code: '003',
    name: 'Cold Wallet',
    body: '#172027',
    back: '#0d151b',
    ambient: '#071016',
    knob: '#58dbff',
    main: '#58dbff',
    action: '#263641',
    pills: '#263641',
    glow: '#b8ff4a',
    bezelInk: '#8ae6ff',
    label: '#9bb1bd',
    logo: '#58dbff',
    logoEyes: '#b8ff4a',
    cardBg: '#172027',
    cardInk: '#8ae6ff',
    cardSub: 'rgba(222,239,247,0.66)',
  },
]

export function findPumpyTheme(id: string | null | undefined): ConsoleTheme {
  return PUMPY_THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME
}

export function themeBackdrop(theme: ConsoleTheme): string {
  return theme.ambient ?? '#07090f'
}
