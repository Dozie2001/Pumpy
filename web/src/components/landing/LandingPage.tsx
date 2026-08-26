import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Swords,
  WalletCards,
} from 'lucide-react'

const REGISTRY_ADDRESS = '0xD68E16fe502731664f163d3b166B75dDA6A45790'
const REGISTRY_URL = `https://shannon-explorer.somnia.network/address/${REGISTRY_ADDRESS}`
const AUTHORIZATION_URL =
  'https://shannon-explorer.somnia.network/tx/0xe637c7adcc6fa1f3fde559e821bb04178cead11bb3dcf8051c6fe608cda0c9c0'

const matchSteps = [
  {
    number: '01',
    title: 'Pick a live market',
    body: 'Pumpy discovers active DreamDEX Event Contracts and shows the exact market rule and expiry.',
    icon: Radio,
  },
  {
    number: '02',
    title: 'See the bot commit',
    body: 'Your rival locks one immutable direction and model hash onchain before your choice is revealed.',
    icon: LockKeyhole,
  },
  {
    number: '03',
    title: 'Sign your own trade',
    body: 'You review premium, payout and maximum loss, then sign directly from your wallet.',
    icon: WalletCards,
  },
] as const

const proofFacts = [
  'Player and bot use separate wallets',
  'Every bot call is committed before reveal',
  'DreamDEX remains the financial source of truth',
] as const

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-canvas text-text">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_72%_16%,color-mix(in_srgb,var(--color-brand-500)_13%,transparent),transparent_31%),radial-gradient(circle_at_14%_44%,color-mix(in_srgb,var(--color-pumpy-cyan)_8%,transparent),transparent_28%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-40 [background-image:linear-gradient(var(--color-viz-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-viz-line)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]"
        aria-hidden="true"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-3 rounded-md pr-2 focus-visible:outline-pumpy-accent"
          aria-label="Pumpy home"
        >
          <img src="/pumpy-mark.svg" width="40" height="40" alt="" />
          <span className="text-lg font-black tracking-[-0.02em]">PUMPY</span>
        </Link>

        <nav
          className="flex items-center gap-2"
          aria-label="Primary navigation"
        >
          <a
            href="https://github.com/Dozie2001/Pumpy"
            target="_blank"
            rel="noreferrer"
            className="hidden min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold text-text-2 transition-colors duration-150 ease-out hover:bg-white/5 hover:text-text focus-visible:outline-pumpy-accent sm:flex motion-reduce:transition-none"
          >
            GitHub
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
          <Link
            to="/play"
            className="flex min-h-11 items-center gap-2 rounded-md bg-pumpy-accent px-4 text-sm font-black text-pumpy-accent-ink transition-colors duration-150 ease-out hover:bg-brand-400 focus-visible:outline-white motion-reduce:transition-none"
          >
            Play on testnet
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main className="relative z-[1]">
        <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.82fr)] lg:gap-16 lg:px-8 lg:pb-28 lg:pt-24">
          <div>
            <div className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-surface/80 px-4 font-mono text-xs font-bold uppercase tracking-[0.12em] text-text-2">
              <span className="size-2 rounded-full bg-up" aria-hidden="true" />
              Live on Somnia Shannon
            </div>

            <h1 className="max-w-[12ch] text-5xl font-black leading-[0.94] tracking-[-0.055em] text-balance sm:text-6xl lg:text-7xl">
              Beat the market.{' '}
              <span className="text-pumpy-accent">Then beat the bot.</span>
            </h1>
            <p className="mt-7 max-w-[60ch] text-lg leading-8 text-text-2 sm:text-xl">
              A one-thumb prediction arcade where transparent bots commit their
              call first—and you trade the same live DreamDEX Event Contract
              from your own wallet.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/play"
                className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-pumpy-accent px-6 text-base font-black text-pumpy-accent-ink transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-white motion-reduce:transform-none motion-reduce:transition-none"
              >
                Enter the arena
                <Swords className="size-5" aria-hidden="true" />
              </Link>
              <a
                href={REGISTRY_URL}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface/70 px-6 text-base font-bold text-text transition-colors duration-150 ease-out hover:border-brand-500/50 hover:bg-surface-2 focus-visible:outline-pumpy-accent motion-reduce:transition-none"
              >
                View onchain registry
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>

            <ul
              className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-text-2"
              aria-label="Pumpy guarantees"
            >
              {proofFacts.map((fact) => (
                <li key={fact} className="flex items-center gap-2">
                  <Check
                    className="size-4 text-up"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                  {fact}
                </li>
              ))}
            </ul>
          </div>

          <ArenaPreview />
        </section>

        <section className="border-y border-line bg-surface/55">
          <div className="mx-auto grid w-full max-w-7xl gap-px bg-line px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
            {matchSteps.map((step) => {
              const Icon = step.icon
              return (
                <article
                  key={step.number}
                  className="bg-canvas px-6 py-8 sm:min-h-64 sm:py-10 lg:px-8"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold tracking-[0.14em] text-pumpy-accent">
                      {step.number}
                    </span>
                    <Icon className="size-5 text-text-3" aria-hidden="true" />
                  </div>
                  <h2 className="mt-10 text-2xl font-black tracking-[-0.025em]">
                    {step.title}
                  </h2>
                  <p className="mt-3 max-w-sm leading-7 text-text-2">
                    {step.body}
                  </p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8 lg:py-28">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-pumpy-cyan">
              Proof, not promises
            </p>
            <h2 className="mt-4 max-w-[12ch] text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
              The bot cannot change its mind after seeing yours.
            </h2>
          </div>

          <div className="rounded-card border border-line-strong bg-surface p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-pumpy-accent">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-black">Decision registry deployed</p>
                <p className="mt-1 leading-7 text-text-2">
                  The fundless contract stores one immutable bot decision per
                  wallet and DreamDEX market. It cannot hold player collateral.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <ProofRow label="Network" value="Shannon · 50312" />
              <ProofRow label="Momentum Max" value="Authorized" positive />
            </div>

            <div className="mt-3 rounded-md bg-canvas p-4">
              <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.14em] text-text-3">
                Registry
              </p>
              <p className="selectable mt-2 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm text-text-2">
                {REGISTRY_ADDRESS}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <a
                href={REGISTRY_URL}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-line-strong px-4 text-sm font-bold transition-colors duration-150 ease-out hover:bg-white/5 focus-visible:outline-pumpy-accent motion-reduce:transition-none"
              >
                Inspect contract
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
              <a
                href={AUTHORIZATION_URL}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-line-strong px-4 text-sm font-bold transition-colors duration-150 ease-out hover:bg-white/5 focus-visible:outline-pumpy-accent motion-reduce:transition-none"
              >
                Verify bot authorization
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section className="border-t border-line px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center rounded-card bg-pumpy-accent px-6 py-12 text-center text-pumpy-accent-ink sm:px-12 sm:py-16">
            <Bot className="size-9" aria-hidden="true" />
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
              Ready to face Momentum Max?
            </h2>
            <p className="mt-4 max-w-xl text-base font-semibold leading-7 opacity-80 sm:text-lg">
              Connect on Shannon, choose a live market and see the bot proof
              before you make your move.
            </p>
            <Link
              to="/play"
              className="mt-8 flex min-h-12 items-center justify-center gap-2 rounded-md bg-canvas px-7 text-base font-black text-text transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-canvas motion-reduce:transform-none motion-reduce:transition-none"
            >
              Play Pumpy
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-[1] border-t border-line px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-sm text-text-3 sm:flex-row sm:items-center sm:justify-between">
          <p>Built for the Somnia × DreamDEX Event Contracts Hackathon.</p>
          <p className="font-mono">TESTNET PRODUCT · NO CUSTODY</p>
        </div>
      </footer>
    </div>
  )
}

function ArenaPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[31rem]"
      aria-label="Pumpy arena preview"
    >
      <div
        className="absolute -inset-6 rounded-[3rem] bg-brand-500/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative rounded-[2.6rem] border border-line-strong bg-surface p-3 shadow-[0_32px_100px_-35px_rgba(0,0,0,0.95)]">
        <div className="rounded-[2rem] border border-white/5 bg-canvas p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-line pb-4 font-mono text-[0.7rem] font-bold uppercase tracking-[0.12em] text-text-3">
            <span>Example round</span>
            <span className="flex items-center gap-2 text-up">
              <span className="size-2 rounded-full bg-up" aria-hidden="true" />
              Registry live
            </span>
          </div>

          <div className="py-6 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-card border border-pumpy-cyan/25 bg-pumpy-cyan/10 text-pumpy-cyan">
              <Bot className="size-8" aria-hidden="true" />
            </div>
            <p className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.16em] text-pumpy-cyan">
              Momentum Max
            </p>
            <h2 className="mx-auto mt-2 max-w-[16ch] text-3xl font-black leading-tight tracking-[-0.035em]">
              Decision locked before your move.
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-text-2">
              The live round reveals direction, confidence and rationale only
              after the registry transaction is confirmed.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-up/25 bg-up/5 p-4">
              <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.12em] text-up">
                UP
              </p>
              <p className="mt-1 text-sm font-bold text-text-2">Your choice</p>
            </div>
            <div className="rounded-md border border-down/25 bg-down/5 p-4 text-right">
              <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.12em] text-down">
                DOWN
              </p>
              <p className="mt-1 text-sm font-bold text-text-2">Your choice</p>
            </div>
          </div>

          <div className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-md bg-surface-2 px-4 text-sm font-black text-text-2">
            <LockKeyhole
              className="size-4 text-pumpy-accent"
              aria-hidden="true"
            />
            Bot proof required before trade
          </div>
        </div>

        <div
          className="grid grid-cols-[1fr_1fr_1.15fr] gap-3 px-3 pb-2 pt-5"
          aria-hidden="true"
        >
          <span className="h-11 rounded-full bg-up/80 shadow-[inset_0_-3px_0_rgba(0,0,0,0.3)]" />
          <span className="h-11 rounded-full bg-down/80 shadow-[inset_0_-3px_0_rgba(0,0,0,0.3)]" />
          <span className="h-11 rounded-md bg-pumpy-accent shadow-[inset_0_-3px_0_rgba(0,0,0,0.3)]" />
        </div>
      </div>
    </div>
  )
}

function ProofRow({
  label,
  value,
  positive = false,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div className="rounded-md bg-canvas p-4">
      <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.14em] text-text-3">
        {label}
      </p>
      <p
        className={`mt-2 text-sm font-black ${positive ? 'text-up' : 'text-text'}`}
      >
        {value}
      </p>
    </div>
  )
}
