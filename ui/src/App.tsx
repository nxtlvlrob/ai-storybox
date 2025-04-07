import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/auth-context'
import { useProfile } from './context/profile-context'

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
import { StoryViewerScreen } from './screens/story-viewer-screen'

// --- Main App Component --- 

function App() {
  const { currentUser, loading: authLoading, error: authError } = useAuth();
  const { userProfile, profileLoading, profileError } = useProfile();
  
  const isLoading = authLoading || (currentUser && profileLoading);
  const combinedError = authError || profileError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <p className="text-xl text-gray-600">Initializing Storybox...</p>
      </div>
    );
  }

  if (combinedError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-red-100 p-4">
        <p className="text-xl text-red-700 font-semibold mb-4">Error Initializing Storybox</p>
        <p className="text-red-600 text-center">{combinedError.message}</p>
      </div>
    );
  }
  
  const isOnboardingComplete = !!userProfile?.onboardingComplete;
  console.log("User Authed:", !!currentUser, "Onboarding Complete:", isOnboardingComplete);

  return (
    <Routes>
      {!currentUser ? (
        <>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : isOnboardingComplete ? (
        <>
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/create-story" element={<CreateStoryScreen />} />
          <Route path="/my-stories" element={<MyStoriesScreen />} />
          <Route path="/stories/:storyId" element={<StoryViewerScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/setup-profile" element={<Navigate to="/home" replace />} />
          <Route path="/setup-avatar" element={<Navigate to="/home" replace />} />
          <Route path="/setup-confirm" element={<Navigate to="/home" replace />} />
          <Route path="/login" element={<Navigate to="/home" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/setup-profile" element={<ProfileSetupScreen />} />
          <Route path="/setup-avatar" element={<AvatarCreationScreen />} />
          <Route path="/setup-confirm" element={<ConfirmationScreen />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/create-story" element={<Navigate to="/" replace />} />
          <Route path="/my-stories" element={<Navigate to="/" replace />} />
          <Route path="/settings" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  )
}

export default App
