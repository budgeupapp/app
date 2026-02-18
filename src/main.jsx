import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App'
import './index.css'
import 'antd/dist/reset.css'

import posthog from 'posthog-js'
import { PostHogProvider } from '@posthog/react'

// Initialize PostHog
posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2025-05-24',
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
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
    </PostHogProvider>
  </React.StrictMode>
)