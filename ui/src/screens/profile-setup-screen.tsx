import { useNavigate } from 'react-router-dom'

export function ProfileSetupScreen() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-yellow-100 p-4">
      <h1 className="text-3xl font-bold mb-4">Set Up Your Profile</h1>
      {/* TODO: Add profile form elements */}
      <p className="mb-6">Tell us a bit about the listener.</p>
      <button 
        className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600"
        onClick={() => navigate('/setup-avatar')}
      >
        Next: Create Avatar
      </button>
    </div>
  )
} 