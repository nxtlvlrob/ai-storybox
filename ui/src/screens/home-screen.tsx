import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/profile-context'; // Import useProfile
import { useTopics } from '../context/topics-context'; // Import the context hook

export function HomeScreen() {
  const navigate = useNavigate()
  const { userProfile, profileLoading } = useProfile(); // Get profile data
  const { isLoadingTopics, topicsError } = useTopics(); // Get state from context, fetchTopics is no longer needed here

  // Display loading or placeholder while profile loads
  const displayName = profileLoading ? '...' : (userProfile?.name || 'Adventurer');
  const avatarUrl = userProfile?.avatarUrl; 

  function handleStartStory() {
    navigate('/create-story');
  }

  function handleViewMyStories() {
    navigate('/my-stories');
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 text-white p-4">
      {/* Avatar Display */}
      <div className="w-32 h-32 mb-6 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 border-purple-300">
        {profileLoading ? (
          <span className="text-gray-400 text-sm">Loading...</span>
        ) : avatarUrl ? (
          <img src={avatarUrl} alt="User Avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-purple-600 text-2xl font-bold">{displayName.charAt(0)}</span> // Fallback initial
        )}
      </div>

      <h1 className="text-4xl sm:text-5xl font-bold mb-8 drop-shadow-lg text-center">Welcome to AI StoryBox, {displayName}!</h1>
      <p className="text-lg sm:text-xl mb-10 sm:mb-12 text-center max-w-md drop-shadow-md">
        Create magical, personalized stories for your little ones with the power of AI.
      </p>
      
      <div className="space-y-4 sm:space-y-6">
        <button 
          onClick={handleStartStory} 
          className="w-60 sm:w-64 px-6 sm:px-8 py-3 sm:py-4 bg-white border-2 border-white mx-4 text-purple-600 font-semibold rounded-lg shadow-lg hover:bg-gray-100 transition duration-300 ease-in-out text-base sm:text-lg transform hover:scale-105"
        >
          ✨ Start a New Story
        </button>
        <button 
          onClick={handleViewMyStories} 
          className="w-60 sm:w-64 px-6 sm:px-8 py-3 sm:py-4 bg-transparent border-2 border-white mx-4 text-white font-semibold rounded-lg shadow-lg hover:bg-white hover:bg-opacity-20 transition duration-300 ease-in-out text-base sm:text-lg transform hover:scale-105"
        >
          📚 My Stories
        </button>
      </div>

      {/* Display Topic Loading/Error for debugging */}
      {isLoadingTopics && <div className="mt-6 text-sm text-yellow-200">Fetching topic suggestions...</div>}
      {topicsError && <div className="mt-6 text-sm text-red-200">Error fetching topics: {topicsError}</div>}
    </div>
  )
} 