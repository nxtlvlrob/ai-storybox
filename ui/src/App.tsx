import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/auth-context'

// Import Screens
import { LoginScreen } from './screens/login-screen'
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
  const { currentUser, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <p className="text-xl text-gray-600">Initializing Storybox...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-red-100">
        <p className="text-xl text-red-700 font-semibold mb-4">Error Initializing Storybox</p>
        <p className="text-red-600 text-center">{error.message}</p>
      </div>
    );
  }

  console.log("Authenticated User ID:", currentUser?.uid);
  
  return (
    <Routes>
      {!currentUser ? (
        <>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/setup-profile" element={<ProfileSetupScreen />} />
          <Route path="/setup-avatar" element={<AvatarCreationScreen />} />
          <Route path="/setup-confirm" element={<ConfirmationScreen />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/create-story" element={<CreateStoryScreen />} />
          <Route path="/my-stories" element={<MyStoriesScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  )
}

export default App
