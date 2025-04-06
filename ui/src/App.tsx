import { Routes, Route } from 'react-router-dom'

// Import Screens
import { WelcomeScreen } from './screens/welcome-screen'
import { ProfileSetupScreen } from './screens/profile-setup-screen'
import { AvatarCreationScreen } from './screens/avatar-creation-screen'
import { ConfirmationScreen } from './screens/confirmation-screen'
import { HomeScreen } from './screens/home-screen'
import { CreateStoryScreen } from './screens/create-story-screen'
import { MyStoriesScreen } from './screens/my-stories-screen'
import { SettingsScreen } from './screens/settings-screen'

// --- Main App Component --- 

function App() {
  return (
    <Routes>
      {/* Onboarding Flow */}
      <Route path="/" element={<WelcomeScreen />} />
      <Route path="/setup-profile" element={<ProfileSetupScreen />} />
      <Route path="/setup-avatar" element={<AvatarCreationScreen />} />
      <Route path="/setup-confirm" element={<ConfirmationScreen />} />

      {/* Main Application Area */}
      <Route path="/home" element={<HomeScreen />} />
      <Route path="/create-story" element={<CreateStoryScreen />} />
      <Route path="/my-stories" element={<MyStoriesScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />

      {/* TODO: Add 404 Not Found Route */}
    </Routes>
  )
}

export default App
