# Pumpy web

The mobile 3D handheld and accessible DOM fallback for Pumpy, a game-first
prediction arcade powered by DreamDEX Event Contracts on Somnia Shannon
testnet.

## Local development

```bash
cd ..
cp .env.example .env
cd web
bun install
bun run dev
```

Open `http://localhost:3200` for the public landing page, then enter the console
at `/play`. The public Shannon and DreamDEX read endpoints are already present
in the root `.env.example`; no private key is needed for market discovery.

## Checks

```bash
bunx tsc --noEmit
bun test
bun run build
```

## Source boundaries

- `src/components/pumpy/`: funded games, arcade games, and position screens
- `src/components/landing/`: public game-first product story
- `src/components/console/`: preserved handheld rendering and controls
- `src/lib/dreamdex/`: typed Somnia/DreamDEX adapter boundary
- `src/lib/audio.ts` and `src/lib/haptics.ts`: reusable feedback engines

Inherited protocol-specific modules remain temporary migration input. New Pumpy
features must not import them; replace them incrementally after the equivalent
DreamDEX flow is verified.
