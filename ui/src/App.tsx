import './App.css'
import { PixelFont } from './components/pixel-font'
import PixelButton from './components/pixel-button'

function App() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black p-4">
      <div className="relative w-full max-w-4xl aspect-video overflow-hidden rounded-lg border-4 border-black">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a6a6a] to-[#3a9a9a] z-0"></div>

        {/* Content container */}
        <div className="relative z-10 flex flex-col items-center justify-between h-full p-8">
          {/* Title */} 
          <div className="w-full text-center mb-12">
            <PixelFont text="AI STORYBOX" size="xlarge" color="yellow" />
          </div>

          {/* Buttons container */}
          <div className="w-full max-w-2xl space-y-8">
            {/* New Story Button */}
            <PixelButton color="orange" emoji="🦊" label="NEW STORY" large />

            {/* My Stories Button */}
            <PixelButton color="teal" emoji="📖" label="MY STORIES" large />
          </div>

          {/* More Button */}
          <div className="self-end mt-8">
            <PixelButton color="teal" label="MORE" medium />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
