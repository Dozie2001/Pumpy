import {
  Award,
  Check,
  CircleDollarSign,
  Clock3,
  Gamepad2,
  History,
  LoaderCircle,
  Palette,
  RefreshCw,
  Trophy,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import type { PortfolioPosition } from '@somnia-chain/markets-sdk'

import type { ConsoleTheme } from '@/components/console/themes'
import type { PlayerPortfolioState } from '@/lib/dreamdex/usePlayerPortfolio'
import type { PumpyPlayerProfile } from '@/lib/pumpy/playerProfile'
import { PUMPY_THEMES } from '@/components/console/themes'
import { usePlayerPortfolio } from '@/lib/dreamdex/usePlayerPortfolio'
import { usePlayerWallet } from '@/lib/dreamdex/usePlayerWallet'
import {
  profileAchievements,
  readPlayerProfile,
} from '@/lib/pumpy/playerProfile'
import { haptic } from '@/lib/haptics'
import { cnm } from '@/utils/style'

type Tab = 'player' | 'history' | 'achievements' | 'customize'

const EMPTY_PROFILE: PumpyPlayerProfile = {
  version: 1,
  account: '0x0000000000000000000000000000000000000000',
  plays: [],
}

const TABS: Array<{ id: Tab; label: string; icon: typeof UserRound }> = [
  { id: 'player', label: 'Player', icon: UserRound },
  { id: 'history', label: 'Portfolio', icon: WalletCards },
  { id: 'achievements', label: 'Badges', icon: Award },
  { id: 'customize', label: 'Skins', icon: Palette },
]

const TAB_TITLES: Record<Tab, string> = {
  player: 'Player card',
  history: 'Portfolio',
  achievements: 'Badges',
  customize: 'Device skins',
}

export function PumpyMenuDrawer({
  open,
  onClose,
  theme,
  onTheme,
}: {
  open: boolean
  onClose: () => void
  theme: ConsoleTheme
  onTheme: (theme: ConsoleTheme) => void
}) {
  const wallet = usePlayerWallet()
  const chainPortfolio = usePlayerPortfolio(wallet.address, open)
  const [tab, setTab] = useState<Tab>('player')
  const [profile, setProfile] = useState<PumpyPlayerProfile>(EMPTY_PROFILE)
  const [candleBest, setCandleBest] = useState(0)

  useEffect(() => {
    if (!open) return
    setTab('player')
    const refresh = () => {
      if (wallet.address) {
        setProfile(readPlayerProfile(window.localStorage, wallet.address))
      } else {
        setProfile(EMPTY_PROFILE)
      }
      setCandleBest(Number(window.localStorage.getItem('pumpy:candle-hop:best') ?? 0))
    }
    refresh()
    window.addEventListener('pumpy:profile-updated', refresh)
    return () => window.removeEventListener('pumpy:profile-updated', refresh)
  }, [open, wallet.address])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  const achievements = useMemo(
    () => profileAchievements(profile, candleBest),
    [candleBest, profile],
  )
  const unlocked = achievements.filter((achievement) => achievement.unlocked).length
  const volume = profile.plays.reduce(
    (total, play) => total + Number(formatUnits(BigInt(play.premiumRaw), play.collateralDecimals)),
    0,
  )

  if (!open) return null

  return (
    <div className="viewport-fill absolute inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Close player menu"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/72 backdrop-blur-[10px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Pumpy player menu"
        className="pumpy-menu-rise absolute inset-x-2 bottom-2 top-[5%] flex flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#0b0e13] shadow-[0_-28px_80px_rgba(0,0,0,.65)] sm:inset-x-3 sm:bottom-3"
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <div>
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-brand-500">Pumpy OS</div>
            <div className="mt-0.5 text-[22px] font-black uppercase leading-none text-text">{TAB_TITLES[tab]}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-text-2"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="grid shrink-0 grid-cols-4 border-y border-white/10" aria-label="Player menu sections">
          {TABS.map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  haptic('selection')
                  setTab(item.id)
                }}
                className={cnm(
                  'flex min-h-14 flex-col items-center justify-center gap-1 border-l border-white/10 font-mono text-[8px] font-black uppercase tracking-[0.08em] first:border-l-0',
                  active ? 'bg-brand-500/12 text-brand-500' : 'text-text-3',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {tab === 'player' && (
            <PlayerCard
              address={wallet.address}
              status={wallet.status}
              plays={profile.plays.length}
              volume={volume}
              candleBest={candleBest}
              unlocked={unlocked}
              totalBadges={achievements.length}
              onConnect={() => void wallet.connect()}
            />
          )}
          {tab === 'history' && (
            <PortfolioPanel
              profile={profile}
              state={chainPortfolio}
              onRefresh={() => void chainPortfolio.refresh()}
            />
          )}
          {tab === 'achievements' && (
            <div className="grid grid-cols-2 gap-3">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={cnm(
                    'min-h-36 rounded-[22px] border p-4',
                    achievement.unlocked
                      ? 'border-brand-500/40 bg-brand-500/10'
                      : 'border-white/9 bg-white/[0.035]',
                  )}
                >
                  <div className={cnm('grid h-9 w-9 place-items-center rounded-full', achievement.unlocked ? 'bg-brand-500 text-pumpy-accent-ink' : 'bg-white/8 text-text-3')}>
                    {achievement.unlocked ? <Trophy className="h-4 w-4" /> : <Award className="h-4 w-4" />}
                  </div>
                  <div className="mt-3 text-[14px] font-black uppercase leading-none text-text">{achievement.name}</div>
                  <p className="mt-2 text-[10px] font-medium leading-[1.35] text-text-3">{achievement.description}</p>
                  <div className={cnm('mt-3 font-mono text-[9px] font-black uppercase tracking-[0.1em]', achievement.unlocked ? 'text-brand-500' : 'text-text-3')}>
                    {achievement.unlocked ? 'Unlocked' : achievement.progress}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 'customize' && (
            <div>
              <p className="mb-4 max-w-[36ch] text-[12px] font-medium leading-[1.5] text-text-2">
                Change the handheld material without changing the game screen or control geometry.
              </p>
              <div className="space-y-3">
                {PUMPY_THEMES.map((option) => {
                  const active = option.id === theme.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        haptic('selection')
                        onTheme(option)
                      }}
                      className={cnm(
                        'flex min-h-20 w-full items-center gap-4 rounded-[22px] border p-3 text-left',
                        active ? 'border-brand-500/55 bg-brand-500/8' : 'border-white/9 bg-white/[0.035]',
                      )}
                    >
                      <span
                        className="relative h-14 w-16 shrink-0 rounded-[18px] border border-white/12 shadow-inner"
                        style={{ background: option.body }}
                      >
                        <span className="absolute left-2 top-2 h-5 w-9 rounded-[5px] bg-black" />
                        <span className="absolute bottom-2 right-2 h-5 w-5 rounded-full" style={{ background: option.main }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">Skin {option.code}</span>
                        <span className="mt-1 block text-[18px] font-black uppercase leading-none text-text">{option.name}</span>
                      </span>
                      {active && <Check className="h-5 w-5 text-brand-500" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function PlayerCard({
  address,
  status,
  plays,
  volume,
  candleBest,
  unlocked,
  totalBadges,
  onConnect,
}: {
  address: string | null
  status: string
  plays: number
  volume: number
  candleBest: number
  unlocked: number
  totalBadges: number
  onConnect: () => void
}) {
  const handle = address ? `player_${address.slice(2, 6).toLowerCase()}` : 'guest_player'
  return (
    <div>
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#18202d] via-[#111621] to-black p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-full border border-brand-500/35 bg-brand-500/12 text-[24px] font-black text-brand-500">P</div>
            <div>
              <div className="text-[21px] font-black lowercase leading-none text-text">{handle}</div>
              <div className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-text-3">
                {address ? `${address.slice(0, 7)}…${address.slice(-5)}` : 'No wallet connected'}
              </div>
            </div>
          </div>
          <span className="rounded-full border border-up/30 bg-up/10 px-2.5 py-1 font-mono text-[8px] font-black uppercase tracking-[0.1em] text-up">
            Shannon
          </span>
        </div>
        <div className="mt-6">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-text-3">Arcade volume</div>
          <div className="mt-1 text-[45px] font-black leading-none text-brand-500">${volume.toFixed(2)}</div>
        </div>
        <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-4">
          <CardStat label="Plays" value={String(plays)} icon={Gamepad2} />
          <CardStat label="Candle best" value={String(candleBest)} icon={Clock3} />
          <CardStat label="Badges" value={`${unlocked}/${totalBadges}`} icon={Trophy} />
        </div>
      </div>
      {!address && (
        <button
          type="button"
          onClick={onConnect}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[20px] bg-brand-500 px-4 font-black uppercase text-pumpy-accent-ink"
        >
          <WalletCards className="h-5 w-5" />
          {status === 'connecting' ? 'Check wallet' : 'Connect wallet'}
        </button>
      )}
      <p className="mt-4 px-2 text-[11px] leading-[1.5] text-text-3">
        Privy usernames and social profiles come after the game loop is stable. For now your player card is tied to the wallet that signs each DreamDEX play.
      </p>
    </div>
  )
}

function CardStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Gamepad2 }) {
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <Icon className="h-4 w-4 text-text-3" />
      <div className="mt-2 text-[19px] font-black leading-none text-text">{value}</div>
      <div className="mt-1 font-mono text-[8px] font-black uppercase tracking-[0.09em] text-text-3">{label}</div>
    </div>
  )
}

function PortfolioPanel({
  profile,
  state,
  onRefresh,
}: {
  profile: PumpyPlayerProfile
  state: PlayerPortfolioState
  onRefresh: () => void
}) {
  const positions = state.portfolio?.positions ?? []
  const openOrders = state.portfolio?.openOrders.length ?? 0
  const recentFills = state.portfolio?.trades.length ?? 0
  const claimablePayout = state.claimable.reduce((total, claim) => {
    const position = positions.find(
      (entry) => entry.market.id.toLowerCase() === claim.marketId.toLowerCase(),
    )
    if (!position) return total
    return total + Number(formatUnits(claim.estPayout, position.market.quoteDecimals))
  }, 0)

  return (
    <div>
      <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#10151d]">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <div>
            <div className="font-mono text-[8px] font-black uppercase tracking-[0.16em] text-text-3">DreamDEX portfolio</div>
            <div className="mt-1 text-[18px] font-black uppercase leading-none text-text">Your positions</div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={state.phase === 'loading'}
            aria-label="Refresh DreamDEX portfolio"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-text-2 transition active:scale-90 disabled:opacity-50"
          >
            <RefreshCw className={cnm('h-4 w-4', state.phase === 'loading' && 'animate-spin')} />
          </button>
        </div>

        <div className="border-t border-white/8 bg-black/35 px-4 py-4">
          <div className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-text-3">Estimated claimable</div>
          <div className={cnm('mt-1 text-[38px] font-black leading-none tabular-nums', claimablePayout > 0 ? 'text-brand-500' : 'text-text')}>
            ${claimablePayout.toFixed(2)}
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-white/8 border-t border-white/8 pt-3">
            <PortfolioStat label="Positions" value={String(positions.length)} />
            <PortfolioStat label="Orders" value={String(openOrders)} />
            <PortfolioStat label="Recent fills" value={String(recentFills)} />
          </div>
        </div>
      </div>

      {state.phase === 'idle' && (
        <PortfolioNotice
          icon={WalletCards}
          title="Connect your player"
          body="Connect from the Player tab to read your onchain DreamDEX positions."
        />
      )}
      {state.phase === 'loading' && !state.portfolio && (
        <div className="flex min-h-36 items-center justify-center gap-2 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-text-3">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Reading Event Contracts
        </div>
      )}
      {state.error && (
        <div className="mt-3 border-l-2 border-pumpy-caution bg-pumpy-caution/8 px-3 py-2 font-mono text-[9px] leading-[1.45] text-pumpy-caution">
          {state.error}
        </div>
      )}

      {positions.length > 0 ? (
        <section className="mt-5">
          <SectionHeading label="Onchain positions" count={positions.length} />
          <div className="mt-2 overflow-hidden rounded-[22px] border border-white/9 bg-white/[0.025]">
            {positions.map((position) => (
              <PositionRow
                key={`${position.market.id}:${position.outcomeIndex}`}
                position={position}
                claimable={state.claimable.some(
                  (claim) =>
                    claim.marketId.toLowerCase() === position.market.id.toLowerCase() &&
                    claim.outcomeIdx === position.outcomeIndex,
                )}
              />
            ))}
          </div>
        </section>
      ) : state.phase === 'ready' ? (
        <PortfolioNotice
          icon={CircleDollarSign}
          title="No open positions"
          body="A filled Lucky play will appear here from DreamDEX's onchain portfolio index."
        />
      ) : null}

      <section className="mt-5">
        <SectionHeading label="Arcade activity" count={profile.plays.length} />
        {profile.plays.length ? (
          <div className="mt-2 overflow-hidden rounded-[22px] border border-white/9 bg-white/[0.025]">
            {profile.plays.map((play) => (
              <div key={play.id} className="flex items-center gap-3 border-b border-white/8 p-3 last:border-b-0">
                <div className={cnm('grid h-10 w-10 place-items-center rounded-full font-black', play.side === 'UP' ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>
                  {play.side === 'UP' ? '↑' : '↓'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-black uppercase text-text">{play.asset} {play.side}</div>
                  <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-text-3">
                    {formatActivityTime(play.submittedAt)} · {play.status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[12px] font-black text-text">${Number(formatUnits(BigInt(play.premiumRaw), play.collateralDecimals)).toFixed(2)}</div>
                  <div className="mt-1 font-mono text-[8px] uppercase text-text-3">{play.collateralSymbol}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-[22px] border border-dashed border-white/10 px-4 py-7 text-center">
            <History className="mx-auto h-6 w-6 text-text-3" />
            <p className="mt-2 text-[11px] text-text-3">No wallet-signed arcade plays yet.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function PositionRow({ position, claimable }: { position: PortfolioPosition; claimable: boolean }) {
  const side = position.outcomeIndex === 0 ? 'YES' : 'NO'
  const resolved = position.market.winningOutcome != null
  const won = resolved && position.market.winningOutcome === position.outcomeIndex
  const status = claimable
    ? 'Claimable'
    : position.market.voided
      ? 'Voided'
      : won
        ? 'Won'
        : resolved
          ? 'Lost'
          : position.market.status
  const positive = claimable || won
  const negative = resolved && !won && !position.market.voided

  return (
    <div className="flex items-center gap-3 border-b border-white/8 p-3 last:border-b-0">
      <div className={cnm('grid h-10 w-10 shrink-0 place-items-center rounded-full text-[16px] font-black', side === 'YES' ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>
        {side === 'YES' ? '↑' : '↓'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-black uppercase text-text">
          {position.market.asset} · {side}
        </div>
        <div className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.07em] text-text-3">
          {position.market.interval ?? 'Event'} · {formatExpiry(position.market.expiry)}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[12px] font-black text-text tabular-nums">
          {Number(formatUnits(BigInt(position.balance), position.market.quoteDecimals)).toFixed(2)}
        </div>
        <div className={cnm('mt-1 font-mono text-[8px] font-black uppercase', positive ? 'text-up' : negative ? 'text-down' : 'text-text-3')}>
          {status}
        </div>
      </div>
    </div>
  )
}

function PortfolioStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <div className="text-[18px] font-black leading-none text-text tabular-nums">{value}</div>
      <div className="mt-1 font-mono text-[7px] font-black uppercase tracking-[0.08em] text-text-3">{label}</div>
    </div>
  )
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-2">{label}</div>
      <div className="font-mono text-[9px] font-black text-text-3">{count}</div>
    </div>
  )
}

function PortfolioNotice({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof WalletCards
  title: string
  body: string
}) {
  return (
    <div className="mt-4 rounded-[22px] border border-dashed border-white/10 px-4 py-7 text-center">
      <Icon className="mx-auto h-7 w-7 text-text-3" />
      <div className="mt-3 text-[17px] font-black uppercase text-text">{title}</div>
      <p className="mx-auto mt-2 max-w-[30ch] text-[11px] leading-[1.45] text-text-3">{body}</p>
    </div>
  )
}

function formatExpiry(expiry: string): string {
  const timestamp = Number(expiry) * 1_000
  if (!Number.isFinite(timestamp)) return 'Expiry unavailable'
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatActivityTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
