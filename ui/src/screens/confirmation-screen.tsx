import { useNavigate } from 'react-router-dom'

export function ConfirmationScreen() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-red-100">
      <h1 className="text-3xl font-bold mb-4">Profile Ready!</h1>
      {/* TODO: Display profile summary */}
      <p className="mb-6">Everything looks great.</p>
      <button 
        className="px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg shadow hover:bg-teal-600"
        onClick={() => navigate('/home')}
      >
        Start Exploring!
      </button>
    </div>
  )
} 