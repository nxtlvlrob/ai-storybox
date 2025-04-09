import { useNavigate } from 'react-router-dom'
import { useProfile } from '../context/profile-context'; // Import useProfile
import { useTopics } from '../context/topics-context'; // Import the context hook
// import { FiSettings } from 'react-icons/fi'; // Removed icon import

// Import an icon if desired, e.g., from react-icons
// import { FiSettings } from 'react-icons/fi'; 

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
  
  function handleGoToSettings() {
    navigate('/settings'); // Navigate to settings screen
  }

  return (
    // Added relative positioning for the absolute settings button
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 text-white p-4">
      
      {/* Settings Text Button - Top Right Corner */}
      <button 
        onClick={handleGoToSettings}
        // Adjusted padding for text
        className="absolute top-4 right-4 px-3 py-1.5 rounded-lg text-sm text-white bg-black bg-opacity-20 hover:bg-opacity-40 transition duration-300 ease-in-out"
        aria-label="Settings"
      >
        Settings {/* Changed from icon to text */}
      </button>

      {/* Avatar Display - Reduced bottom margin */}
      <div className="w-28 h-28 sm:w-32 sm:h-32 mb-4 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 border-purple-300">
        {profileLoading ? (
          <span className="text-gray-400 text-sm">Loading...</span>
        ) : avatarUrl ? (
          <img src={avatarUrl} alt="User Avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-purple-600 text-2xl font-bold">{displayName.charAt(0)}</span> // Fallback initial
        )}
      </div>

      {/* Welcome Text - Reduced bottom margin */}
      <h1 className="text-3xl sm:text-4xl font-bold mb-4 sm:mb-6 drop-shadow-lg text-center">Welcome, {displayName}!</h1>
      {/* Removed the longer paragraph to save space */} 
      {/* <p className="text-lg sm:text-xl mb-10 sm:mb-12 text-center max-w-md drop-shadow-md">
        Create magical, personalized stories for your little ones with the power of AI.
      </p> */}
      
      {/* Main Action Buttons - In a Row */}
      <div className="flex flex-row items-center space-x-4 sm:space-x-6 mt-4"> {/* Changed to flex-row, added space-x, added mt-4 */} 
        <button 
          onClick={handleStartStory} 
          // Adjusted padding/text size slightly
          className="w-auto px-5 py-2.5 sm:px-6 sm:py-3 bg-white border-2 border-white text-purple-600 font-semibold rounded-lg shadow-lg hover:bg-gray-100 transition duration-300 ease-in-out text-sm sm:text-base transform hover:scale-105"
        >
          ✨ New Story
        </button>
        <button 
          onClick={handleViewMyStories} 
           // Adjusted padding/text size slightly
          className="w-auto px-5 py-2.5 sm:px-6 sm:py-3 bg-transparent border-2 border-white text-white font-semibold rounded-lg shadow-lg hover:bg-white hover:bg-opacity-20 transition duration-300 ease-in-out text-sm sm:text-base transform hover:scale-105"
        >
          📚 My Stories
        </button>
        {/* Removed the old Settings button from here */}
      </div>

      {/* Debug info - kept at bottom */} 
      {isLoadingTopics && <div className="absolute bottom-2 left-2 text-xs text-yellow-200 opacity-75">Fetching topics...</div>}
      {topicsError && <div className="absolute bottom-2 left-2 text-xs text-red-200 opacity-75">Error: {topicsError}</div>}
    </div>
  )
} 