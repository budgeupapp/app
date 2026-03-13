import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App'
import './index.css'
import 'antd/dist/reset.css'

import posthog from 'posthog-js'
import 'posthog-js/dist/surveys'
import { supabase } from './lib/supabaseClient'

// Prevent pinch-to-zoom on iOS (Safari ignores viewport meta)
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false })
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false })
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false })
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault()
}, { passive: false })

// Clear saved scroll positions and tab state on fresh page load
sessionStorage.removeItem('budgeup_scroll_dashboard_fixed')
sessionStorage.removeItem('budgeup_scroll_dashboard_goals')
sessionStorage.removeItem('budgeup_scroll_dashboard_variable')
sessionStorage.removeItem('budgeup_scroll_settings')
sessionStorage.removeItem('budgeup_active_tab')

// Fetch the existing Supabase session (reads from localStorage — effectively sync)
// so PostHog can be bootstrapped with the user identity before init. This prevents
// the anonymous→identified session rotation that causes two session_started events.
const { data: { session } } = await supabase.auth.getSession()

window.posthog = posthog

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,

  capture_pageview: true,
  capture_pageleave: true,
  opt_in_site_apps: true,
})

// Prevent page-level scrolling on iOS — only allow scroll inside scrollable containers
document.addEventListener('touchmove', (e) => {
  // Block pinch-to-zoom (multi-touch) at the page level
  if (e.touches.length > 1) {
    e.preventDefault()
    return
  }
  let el = e.target
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el)
    const overflowY = style.getPropertyValue('overflow-y')
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return // allow scroll inside this container
    }
    el = el.parentElement
  }
  e.preventDefault()
}, { passive: false })

// Prevent Safari gesturestart/gesturechange zoom
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false })
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false })

// Prevent iOS Safari from scrolling the whole page when focusing inputs.
// iOS ignores preventScroll:true and scrolls the document to keep the input
// above the virtual keyboard. We lock the page scroll to 0,0 since all our
// scrolling happens inside inner containers, not the document itself.
window.addEventListener('scroll', () => {
  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0)
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#147B75',
          colorInfo: '#147B75',
          colorSuccess: '#147B75',
          fontFamily: 'Nunito, system-ui, sans-serif'
        }
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
