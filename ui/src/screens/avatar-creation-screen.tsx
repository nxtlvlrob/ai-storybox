import { useNavigate } from 'react-router-dom'

export function AvatarCreationScreen() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-purple-100 p-4">
      <h1 className="text-3xl font-bold mb-4">Create Your Avatar</h1>
      {/* TODO: Add avatar customization/randomization */}
      <p className="mb-6">Let's make a fun character!</p>
      <button 
        className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg shadow hover:bg-orange-600"
        onClick={() => navigate('/setup-confirm')}
      >
        Next: Confirm Profile
      </button>
    </div>
  )
} 