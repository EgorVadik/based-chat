import { Toaster } from '@based-chat/ui/components/sonner'
import { TooltipProvider } from '@based-chat/ui/components/tooltip'
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { ErrorPage } from '@/components/error-page'
import { NotFoundPage } from '@/components/not-found-page'
import { ThemeProvider } from '@/components/theme-provider'

import '../index.css'

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  errorComponent: ErrorPage,
  notFoundComponent: NotFoundPage,
  head: () => ({
    meta: [
      {
        title: 'Based Chat',
      },
      {
        name: 'description',
        content: 'Based Chat — AI chat for the based.',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
      },
    ],
  }),
})

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute='class'
        defaultTheme='dark'
        disableTransitionOnChange
        storageKey='vite-ui-theme'
      >
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
        <Toaster richColors />
      </ThemeProvider>
      {/* <TanStackRouterDevtools position="bottom-left" /> */}
    </>
  )
}
