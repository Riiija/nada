import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from 'sonner'
import { router } from './router'
import { registerPwa } from './lib/pwa'
import { ThemeProvider } from './lib/theme'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </ThemeProvider>
  </StrictMode>,
)

registerPwa()
