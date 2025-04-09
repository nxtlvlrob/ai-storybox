import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { useProfile } from '../context/profile-context'
import { updateUserProfile } from '../services/firestore-service'

export function ConfirmationScreen() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { userProfile, profileLoading, refreshProfile } = useProfile()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Display loading or placeholder while profile loads
  const displayName = profileLoading ? '...' : (userProfile?.name || 'Friend')
  const avatarUrl = userProfile?.avatarUrl

  async function handleStartExploring() {
    if (!currentUser) {
      setSaveError("Not authenticated. Cannot complete setup.")
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      // Update profile to mark onboarding as complete
      await updateUserProfile(currentUser.uid, { onboardingComplete: true })
      console.log('Onboarding marked complete.')
      await refreshProfile()
      console.log('Profile context refreshed, navigating home...')
      navigate('/home')
    } catch (error) {
      console.error("Failed to mark onboarding complete:", error)
      setSaveError("Could not complete setup. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-blue-100 p-4">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4">Profile Ready!</h1>
      <p className="mb-6 text-lg">Everything looks great.</p>
      
      {/* Avatar Display */}
      <div className="w-48 h-48 mb-6 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 border-blue-300">
        {profileLoading ? (
            <span className="text-gray-400 text-sm">Loading...</span>
        ) : avatarUrl ? (
            <img src={avatarUrl} alt="User Avatar" className="w-full h-full object-cover" />
        ) : (
            <span className="text-gray-400 text-sm">No Avatar</span>
        )}
      </div>
      
      {/* Welcome Message */}
      <p className="mb-6 text-lg font-semibold">Welcome, {displayName}!</p>

      {/* Display Save Error */} 
      {saveError && (
        <p className="text-sm text-red-600 text-center mt-2 mb-2">{saveError}</p>
      )}

      <button 
        className="px-5 py-2.5 sm:px-6 sm:py-3 bg-blue-600 text-white text-sm sm:text-base font-semibold rounded-lg shadow hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        onClick={handleStartExploring}
        disabled={isSaving || profileLoading}
      >
        {isSaving ? 'Starting...' : 'Start Exploring!'}
      </button>
    </div>
  )
} 