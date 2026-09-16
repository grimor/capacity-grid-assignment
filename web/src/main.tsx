import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApiError } from './api'
import { App } from './App'
import './styles.css'

const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
const syncColorScheme = () => document.documentElement.classList.toggle('dark', colorScheme.matches)
syncColorScheme()
colorScheme.addEventListener('change', syncColorScheme)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stepping back and forth between weeks reuses what was just loaded;
      // focusing the window after this long refetches it.
      staleTime: 30_000,
      // The API's 4xx answers won't change on retry.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
