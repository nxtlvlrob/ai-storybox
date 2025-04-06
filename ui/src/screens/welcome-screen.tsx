import { useNavigate } from 'react-router-dom'

export function WelcomeScreen() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-blue-100 text-center p-4">
      <h1 className="text-3xl font-bold mb-4">Welcome to Storybox!</h1>
      <p className="mb-6">Let's get started on your storytelling adventure.</p>
      <button 
        className="px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow hover:bg-green-600"
        onClick={() => navigate('/setup-profile')} 
      >
        Let's Get Started
      </button>
    </div>
  )
} 