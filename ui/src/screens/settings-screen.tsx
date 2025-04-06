import { useNavigate } from 'react-router-dom'

export function SettingsScreen() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-lime-100 p-4">
      <h1 className="text-3xl font-bold mb-4">Settings</h1>
      {/* TODO: Add parental gate */}
      {/* TODO: Add settings options (profile, avatar, volume, reset) */}
      <p className="mb-6">Adjust Storybox settings here.</p>
      <button 
        className="absolute top-4 left-4 px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400"
        onClick={() => navigate('/home')} // Go back home
      >
        Back to Home
      </button>
    </div>
  )
} 