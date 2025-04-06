import { useNavigate } from 'react-router-dom'

export function CreateStoryScreen() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-indigo-100 p-4">
      <h1 className="text-3xl font-bold mb-4">Create a New Story</h1>
      {/* TODO: Add theme/preference selection */}
      <p className="mb-6">Let's imagine something wonderful!</p>
      {/* TODO: Add button to trigger generation */}
      <button 
        className="absolute top-4 left-4 px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400"
        onClick={() => navigate('/home')} // Go back home
      >
        Back to Home
      </button>
    </div>
  )
} 