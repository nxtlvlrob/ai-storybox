import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './context/auth-context.tsx'
import { ProfileProvider } from './context/profile-context.tsx'
import { TopicsProvider } from './context/topics-context.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <ProfileProvider>
          <TopicsProvider>
            <App />
          </TopicsProvider>
        </ProfileProvider>
      </AuthProvider>
    </Router>
  </React.StrictMode>,
)
