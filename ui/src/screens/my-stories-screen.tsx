import { useNavigate } from 'react-router-dom'

export function MyStoriesScreen() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center h-screen bg-pink-100 p-4">
      <h1 className="text-3xl font-bold my-4">My Stories</h1>
      {/* TODO: Add scrollable list of stories */}
      <p className="mb-6 flex-grow">Your created stories will appear here.</p>
      <button 
        className="absolute top-4 left-4 px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400"
        onClick={() => navigate('/home')} // Go back home
      >
        Back to Home
      </button>
    </div>
  )
} 