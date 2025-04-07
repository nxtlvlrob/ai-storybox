import { useNavigate } from 'react-router-dom'

export function HomeScreen() {
  const navigate = useNavigate()
  // TODO: Get user name and avatar
  // TODO: Implement navigation logic

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <h1 className="text-3xl font-bold mb-4">Home</h1>
      <p>Welcome, [User Name]!</p>
      {/* Placeholder for Avatar */}
      <div className="mt-6 space-x-4">
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600"
          onClick={() => navigate('/create-story')} // Navigate to Create Story
        >
          Create a Story
        </button>
        <button 
          className="px-4 py-2 bg-green-500 text-white rounded shadow hover:bg-green-600"
          onClick={() => navigate('/my-stories')} // Navigate to My Stories
        >
          My Stories
        </button>
        <button 
          className="px-4 py-2 bg-gray-500 text-white rounded shadow hover:bg-gray-600"
          onClick={() => navigate('/settings')} // Navigate to Settings
        >
          Settings
        </button>
      </div>
    </div>
  )
} 