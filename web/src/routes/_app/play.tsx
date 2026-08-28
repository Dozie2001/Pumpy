import { createFileRoute } from '@tanstack/react-router'

// The signed-in arcade remains behind the pathless _app layout. Wallet loss or
// explicit disconnect returns to the root console door before another game can
// be opened.
export const Route = createFileRoute('/_app/play')({
  component: () => null,
})
