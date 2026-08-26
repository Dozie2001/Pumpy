import { createFileRoute } from '@tanstack/react-router'

// The console remains isolated behind the pathless _app layout so the landing
// page can explain Pumpy without mounting WebGL or wallet integrations.
export const Route = createFileRoute('/_app/play')({
  component: () => null,
})
