import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Crosshair,
  ExternalLink,
  Gamepad2,
  Layers3,
  Radio,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'

type LandingGame = {
  id: 'lucky' | 'long-shot' | 'range' | 'candle-hop'
  index: string
  name: string
  label: string
  description: string
  icon: LucideIcon
  funded: boolean
}

const games: ReadonlyArray<LandingGame> = [
  {
    id: 'lucky',
    index: '01',
    name: 'I Feel Lucky',
    label: 'Spin a side',
    description:
      'Pumpy deals UP or DOWN. DreamDEX supplies the executable odds.',
    icon: Sparkles,
    funded: true,
  },
  {
    id: 'long-shot',
    index: '02',
    name: 'Long Shot',
    label: 'Pick the strike',
    description:
      'Aim at a real listed BTC or ETH strike and take the live quote.',
    icon: Crosshair,
    funded: true,
  },
  {
    id: 'range',
    index: '03',
    name: 'Range',
    label: 'Build the zone',
    description:
      'Pair two compatible fixed strikes and see the complete payoff first.',
    icon: Layers3,
    funded: true,
  },
  {
    id: 'candle-hop',
    index: '04',
    name: 'Candle Hop',
    label: 'Warm up',
    description: 'A one-button reflex game with no wallet and no funds.',
    icon: Gamepad2,
    funded: false,
  },
] as const

const productFacts = [
  {
    icon: Radio,
    title: 'The market is real',
    body: 'Funded games use live DreamDEX Event Contracts—not house odds.',
  },
  {
    icon: WalletCards,
    title: 'The wallet stays yours',
    body: 'You review the premium, payout and maximum loss before signing.',
  },
  {
    icon: ShieldCheck,
    title: 'The result is legible',
    body: 'Fill, settlement, cash-out and claim stay tied to the onchain position.',
  },
] as const

export function LandingPage() {
  const [selectedGame, setSelectedGame] = useState(0)
  const activeGame = games[selectedGame]

  return (
    <div className="pumpy-landing min-h-dvh overflow-x-hidden bg-canvas text-text">
      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-3 rounded-md pr-2 focus-visible:outline-pumpy-accent"
          aria-label="Pumpy home"
        >
          <img src="/pumpy-mark.svg" width="38" height="38" alt="" />
          <span className="text-base font-black tracking-[-0.02em]">PUMPY</span>
        </Link>

        <nav
          className="flex items-center gap-2"
          aria-label="Primary navigation"
        >
          <a
            href="https://github.com/Dozie2001/Pumpy"
            target="_blank"
            rel="noreferrer"
            className="hidden min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold text-text-2 transition-colors duration-100 ease-out hover:text-text focus-visible:outline-pumpy-accent sm:flex motion-reduce:transition-none"
          >
            Source
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
          <Link
            to="/play"
            className="group flex min-h-11 items-center gap-2 rounded-md bg-text px-4 text-sm font-black text-canvas transition-colors duration-100 ease-out hover:bg-pumpy-accent focus-visible:outline-pumpy-accent motion-reduce:transition-none"
          >
            Play Pumpy
            <ArrowRight
              className="size-4 transition-transform duration-100 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </Link>
        </nav>
      </header>

      <main>
        <section className="relative mx-auto grid w-full max-w-7xl gap-14 px-5 pb-24 pt-16 sm:px-8 sm:pt-24 lg:min-h-[calc(100dvh-84px)] lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,0.72fr)] lg:items-center lg:gap-20 lg:px-10 lg:pb-28 lg:pt-16">
          <div className="relative z-10">
            <p className="flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.16em] text-text-2">
              <span className="h-px w-8 bg-pumpy-accent" aria-hidden="true" />
              DreamDEX arcade · Shannon testnet
            </p>

            <h1 className="mt-8 max-w-[10ch] text-[clamp(4.25rem,10vw,8.8rem)] font-black leading-[0.78] tracking-[-0.075em] text-balance">
              Markets,
              <span className="block text-pumpy-accent">playable.</span>
            </h1>

            <p className="mt-9 max-w-[36rem] text-lg leading-8 text-text-2 sm:text-xl">
              Spin a direction. Aim at a strike. Build a range. Pumpy turns live
              BTC and ETH Event Contracts into games you can play with one
              thumb.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                to="/play"
                className="group flex min-h-13 items-center justify-center gap-3 rounded-md bg-pumpy-accent px-7 text-base font-black text-pumpy-accent-ink transition-transform duration-100 ease-out hover:-translate-y-0.5 focus-visible:outline-white active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none"
              >
                Start playing
                <ArrowRight
                  className="size-5 transition-transform duration-100 ease-out group-hover:translate-x-1 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Link>
              <p className="font-mono text-[0.7rem] font-bold uppercase leading-5 tracking-[0.12em] text-text-3">
                Wallet-signed
                <br />
                Test tUSDC
              </p>
            </div>
          </div>

          <GameDeck game={activeGame} />

          <div
            className="pointer-events-none absolute -right-20 top-0 hidden select-none font-black leading-none tracking-[-0.09em] text-white/[0.018] lg:block lg:text-[27rem]"
            aria-hidden="true"
          >
            P
          </div>
        </section>

        <section className="border-y border-line bg-surface/35">
          <div className="mx-auto grid w-full max-w-7xl lg:grid-cols-[0.72fr_1.28fr]">
            <div className="border-b border-line px-5 py-14 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-20">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-pumpy-accent">
                Choose your game
              </p>
              <h2 className="mt-4 max-w-[12ch] text-4xl font-black leading-[0.94] tracking-[-0.045em] sm:text-5xl">
                Four ways into the same machine.
              </h2>
              <p className="mt-5 max-w-sm leading-7 text-text-2">
                Three funded DreamDEX games and one no-funds warm-up. Nothing
                pretends to be live until you enter the console.
              </p>
            </div>

            <div className="divide-y divide-line">
              {games.map((game, index) => {
                const Icon = game.icon
                const active = selectedGame === index
                return (
                  <button
                    key={game.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedGame(index)}
                    className="group grid min-h-28 w-full grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-5 py-5 text-left transition-colors duration-100 ease-out hover:bg-white/[0.025] focus-visible:outline-pumpy-accent sm:grid-cols-[3rem_1fr_auto] sm:gap-5 sm:px-8 lg:px-10 motion-reduce:transition-none"
                  >
                    <span
                      className={`font-mono text-xs font-bold transition-colors duration-100 ease-out motion-reduce:transition-none ${active ? 'text-pumpy-accent' : 'text-text-3'}`}
                    >
                      {game.index}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-3">
                        <Icon
                          className={`size-5 shrink-0 transition-colors duration-100 ease-out motion-reduce:transition-none ${active ? 'text-pumpy-accent' : 'text-text-3'}`}
                          aria-hidden="true"
                        />
                        <span className="text-xl font-black tracking-[-0.02em] sm:text-2xl">
                          {game.name}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-text-2">
                        {game.description}
                      </span>
                    </span>
                    <span
                      className={`hidden font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] sm:block ${game.funded ? 'text-text-3' : 'text-pumpy-cyan'}`}
                    >
                      {game.funded ? 'DreamDEX' : 'No funds'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-pumpy-cyan">
                Under the game
              </p>
              <h2 className="mt-4 max-w-[11ch] text-4xl font-black leading-[0.94] tracking-[-0.045em] sm:text-5xl">
                The fun is loud. The trade is exact.
              </h2>
            </div>

            <div className="divide-y divide-line border-y border-line">
              {productFacts.map((fact) => {
                const Icon = fact.icon
                return (
                  <article
                    key={fact.title}
                    className="grid grid-cols-[2.75rem_1fr] gap-4 py-7 sm:grid-cols-[3.5rem_1fr] sm:gap-6"
                  >
                    <span className="grid size-11 place-items-center rounded-md bg-surface text-pumpy-accent">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-xl font-black tracking-[-0.02em]">
                        {fact.title}
                      </h3>
                      <p className="mt-2 max-w-xl leading-7 text-text-2">
                        {fact.body}
                      </p>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-line px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-text-3">
                Next market is waiting
              </p>
              <h2 className="mt-4 max-w-[10ch] text-5xl font-black leading-[0.88] tracking-[-0.055em] sm:text-6xl">
                Pick up Pumpy.
              </h2>
            </div>
            <Link
              to="/play"
              className="group flex min-h-14 items-center justify-center gap-4 rounded-md border border-line-strong bg-text px-7 text-base font-black text-canvas transition-colors duration-100 ease-out hover:border-pumpy-accent hover:bg-pumpy-accent focus-visible:outline-pumpy-accent motion-reduce:transition-none"
            >
              Enter the console
              <ArrowRight
                className="size-5 transition-transform duration-100 ease-out group-hover:translate-x-1 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 text-sm text-text-3 sm:flex-row sm:items-center sm:justify-between">
          <p>Built on Somnia with DreamDEX Event Contracts.</p>
          <p className="font-mono text-xs uppercase tracking-[0.1em]">
            Shannon testnet · No custody
          </p>
        </div>
      </footer>
    </div>
  )
}

function GameDeck({ game }: { game: LandingGame }) {
  return (
    <div className="landing-deck relative z-10 mx-auto w-full max-w-[31rem] lg:justify-self-end">
      <div className="rounded-[2.25rem] border border-white/10 bg-surface-2 p-3 shadow-[0_40px_110px_-48px_rgba(0,0,0,1)]">
        <div className="rounded-[1.65rem] border border-white/[0.07] bg-canvas p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-line pb-4 font-mono text-[0.65rem] font-bold uppercase tracking-[0.14em] text-text-3">
            <span>Game select · {game.index}/04</span>
            <span className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full bg-pumpy-accent"
                aria-hidden="true"
              />
              Preview
            </span>
          </div>

          <div
            key={game.id}
            className="landing-game-enter py-7"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.15em] text-pumpy-cyan">
                  {game.label}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                  {game.name}
                </h2>
              </div>
              <span className="rounded-full border border-line-strong px-3 py-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] text-text-2">
                {game.funded ? 'Wallet game' : 'Free play'}
              </span>
            </div>

            <GameVisual game={game.id} />

            <p className="mt-5 max-w-sm text-sm leading-6 text-text-2">
              {game.description}
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-4 font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] text-text-3">
            <span>No live quote shown</span>
            <span>{game.funded ? 'DreamDEX' : 'Arcade'}</span>
          </div>
        </div>

        <div
          className="grid grid-cols-[1fr_1fr_1.25fr] gap-3 px-4 pb-2 pt-5"
          aria-hidden="true"
        >
          <span className="h-10 rounded-full bg-up/80 shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)]" />
          <span className="h-10 rounded-full bg-down/80 shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)]" />
          <span className="h-10 rounded-md bg-pumpy-accent shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)]" />
        </div>
      </div>
    </div>
  )
}

function GameVisual({ game }: { game: LandingGame['id'] }) {
  if (game === 'lucky') {
    return (
      <div
        className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3"
        aria-hidden="true"
      >
        <span className="rounded-md border border-up/25 bg-up/[0.07] px-3 py-5 text-center text-2xl font-black text-up">
          UP
        </span>
        <span className="font-mono text-xs font-bold text-text-3">OR</span>
        <span className="rounded-md border border-down/25 bg-down/[0.07] px-3 py-5 text-center text-2xl font-black text-down">
          DOWN
        </span>
      </div>
    )
  }

  if (game === 'long-shot') {
    return (
      <div
        className="relative mt-8 h-24 overflow-hidden rounded-md border border-line bg-surface/45"
        aria-hidden="true"
      >
        <span className="absolute inset-y-0 left-[68%] w-px bg-pumpy-cyan shadow-[0_0_18px_var(--color-pumpy-cyan)]" />
        <span className="absolute left-[68%] top-3 -translate-x-1/2 rounded-sm bg-pumpy-cyan px-2 py-1 font-mono text-[0.55rem] font-black uppercase text-canvas">
          Target
        </span>
        <span className="absolute bottom-4 left-5 h-7 w-2 rounded-sm bg-text-3/25" />
        <span className="absolute bottom-4 left-10 h-11 w-2 rounded-sm bg-text-3/35" />
        <span className="absolute bottom-4 left-15 h-9 w-2 rounded-sm bg-pumpy-accent/55" />
        <span className="absolute bottom-4 left-20 h-14 w-2 rounded-sm bg-pumpy-accent/80" />
      </div>
    )
  }

  if (game === 'range') {
    return (
      <div
        className="mt-8 rounded-md border border-line bg-surface/45 p-4"
        aria-hidden="true"
      >
        <div className="flex items-center justify-between font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] text-text-3">
          <span>Lower strike</span>
          <span>Upper strike</span>
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <span className="size-3 rounded-full bg-text" />
          <span className="h-4 rounded-full bg-pumpy-accent shadow-[0_0_24px_color-mix(in_srgb,var(--color-pumpy-accent)_32%,transparent)]" />
          <span className="size-3 rounded-full border-2 border-text bg-canvas" />
        </div>
        <p className="mt-3 text-center font-mono text-[0.65rem] font-bold uppercase tracking-[0.14em] text-pumpy-accent">
          Inside the zone
        </p>
      </div>
    )
  }

  return (
    <div
      className="mt-8 flex h-24 items-end justify-center gap-2 overflow-hidden rounded-md border border-line bg-surface/45 px-5 pb-4"
      aria-hidden="true"
    >
      {[36, 58, 44, 72, 52, 82, 62, 38].map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={
            index === 5
              ? 'w-3 rounded-t-sm bg-pumpy-accent'
              : 'w-3 rounded-t-sm bg-text-3/30'
          }
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  )
}
