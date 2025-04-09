import { useNavigate } from 'react-router-dom'

export function WelcomeScreen() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-blue-100 text-center p-4">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4">Welcome to Storybox!</h1>
      <p className="mb-6">Let's get started on your storytelling adventure.</p>
      <button 
        className="px-5 py-2.5 sm:px-6 sm:py-3 bg-blue-600 text-white text-sm sm:text-base font-semibold rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        onClick={() => navigate('/setup-profile')} 
      >
        Let's Get Started
      </button>
    </div>
  )
} 