import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/profile-context'; // Import useProfile

export function HomeScreen() {
  const navigate = useNavigate()
  const { userProfile, profileLoading } = useProfile(); // Get profile data

  // Display loading or placeholder while profile loads
  const displayName = profileLoading ? '...' : (userProfile?.name || 'Adventurer');
  const avatarUrl = userProfile?.avatarUrl; 

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-4">
      {/* Avatar Display */}
      <div className="w-32 h-32 mb-4 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 border-blue-300">
        {profileLoading ? (
          <span className="text-gray-400 text-sm">Loading...</span>
        ) : avatarUrl ? (
          <img src={avatarUrl} alt="User Avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-gray-400 text-sm">No Avatar</span>
        )}
      </div>
      
      {/* Welcome Message */}
      <h1 className="text-3xl font-bold mb-6">Welcome, {displayName}!</h1>
      
      {/* Navigation Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button 
          className="px-6 py-3 w-48 bg-blue-500 text-white text-lg rounded-lg shadow hover:bg-blue-600"
          onClick={() => navigate('/create-story')}
        >
          Create a Story
        </button>
        <button 
          className="px-6 py-3 w-48 bg-green-500 text-white text-lg rounded-lg shadow hover:bg-green-600"
          onClick={() => navigate('/my-stories')}
        >
          My Stories
        </button>
        <button 
          className="px-6 py-3 w-48 bg-gray-500 text-white text-lg rounded-lg shadow hover:bg-gray-600"
          onClick={() => navigate('/settings')}
        >
          Settings
        </button>
      </div>
    </div>
  )
} 