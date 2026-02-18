import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App'
import './index.css'
import 'antd/dist/reset.css'

import posthog from 'posthog-js'
import { supabase } from './lib/supabaseClient'

// Fetch the existing Supabase session (reads from localStorage — effectively sync)
// so PostHog can be bootstrapped with the user identity before init. This prevents
// the anonymous→identified session rotation that causes two session_started events.
const { data: { session } } = await supabase.auth.getSession()

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,

  capture_pageview: true,
  capture_pageleave: true,


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
