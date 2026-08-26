# Pumpy web

The mobile 3D handheld and accessible DOM fallback for Pumpy, a
player-versus-bot prediction arcade powered by DreamDEX Event Contracts on
Somnia Shannon testnet.

## Local development

```bash
cp .env.example .env
bun install
bun run dev
```

Open `http://localhost:3200`. The public Shannon and DreamDEX read endpoints are
already present in `.env.example`; no private key is needed for market discovery.

## Checks

```bash
bunx tsc --noEmit
bun test
bun run build
```

## Source boundaries

- `src/components/pumpy/`: player-versus-bot screens and product components
- `src/components/console/`: preserved handheld rendering and controls
- `src/lib/dreamdex/`: typed Somnia/DreamDEX adapter boundary
- `src/lib/audio.ts` and `src/lib/haptics.ts`: reusable feedback engines

Inherited protocol-specific modules remain temporary migration input. New Pumpy
features must not import them; replace them incrementally after the equivalent
DreamDEX flow is verified.
