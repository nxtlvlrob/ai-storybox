import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAvatar } from '@dicebear/core';
import * as adventurer from '@dicebear/adventurer';

export function AvatarCreationScreen() {
  const navigate = useNavigate()
  const [seed, setSeed] = useState(Math.random().toString(36).substring(7));

  const avatarSvg = useMemo(() => {
    // Workaround: Cast to 'any' because TS cannot resolve the named import correctly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = adventurer as any;

    return createAvatar(style, {
      seed: seed,
      size: 256,
    }).toString();
  }, [seed]);

  function randomizeAvatar() {
    setSeed(Math.random().toString(36).substring(7));
  }

  function handleNextClick() {
    console.log("Chosen Avatar Seed:", seed);
    navigate('/setup-confirm');
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-purple-100 p-4 overflow-hidden">
      <h1 className="text-2xl md:text-3xl font-bold mb-4 text-purple-800 text-center">Create Your Avatar</h1>

      <div className="w-48 h-48 md:w-64 md:h-64 mb-6 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 border-purple-300">
        <div dangerouslySetInnerHTML={{ __html: avatarSvg }} className="w-full h-full scale-110" />
      </div>

      <div className="flex flex-col items-center space-y-4">
        <button 
          className="px-6 py-3 bg-yellow-400 text-yellow-800 font-semibold rounded-lg shadow hover:bg-yellow-500 text-lg"
          onClick={randomizeAvatar}
        >
          Try Another!
        </button>
        
        <button 
          className="px-8 py-3 bg-orange-500 text-white font-semibold rounded-lg shadow hover:bg-orange-600 text-lg"
          onClick={handleNextClick}
        >
          Looks Good!
        </button>
      </div>
    </div>
  )
} 