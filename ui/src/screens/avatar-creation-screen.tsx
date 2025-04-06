import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAvatar } from '@dicebear/core';
import * as adventurerCollection from '@dicebear/adventurer';

// Define available options (based on documentation, limited selection for UI)
const hairStyles = ['short01', 'short02', 'short03', 'short04', 'short05', 'long01', 'long02', 'long03', 'long04', 'long05'];
const eyeStyles = ['variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06', 'variant09', 'variant10', 'variant11', 'variant12'];
const mouthStyles = ['variant01', 'variant02', 'variant03', 'variant06', 'variant07', 'variant09', 'variant10', 'variant11', 'variant18', 'variant19', 'variant30'];
const glassesStyles = ['none', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05']; // Added 'none' 

const skinColors = ['f2d3b1', 'ecad80', 'e0a39e', 'd2996f', 'a56e4d', '8c5a3c', '6a4d3a']; // Example palette
const hairColors = ['2c1b18', '4a312c', '6a4e35', 'afafaf', 'e6e6e6', 'cb6820', 'dba3be', 'e5d7a0']; // Example palette

// Interface for avatar options state (using indices)
interface AvatarOptions {
  hairStyleIndex: number;
  eyeStyleIndex: number;
  mouthStyleIndex: number;
  glassesStyleIndex: number;
  skinColorIndex: number;
  hairColorIndex: number;
}

// Helper function to cycle indices
function cycleIndex(currentIndex: number, arrayLength: number, direction: 'next' | 'prev'): number {
  if (direction === 'next') {
    return (currentIndex + 1) % arrayLength;
  } else {
    return (currentIndex - 1 + arrayLength) % arrayLength;
  }
}

export function AvatarCreationScreen() {
  const navigate = useNavigate()
  const [options, setOptions] = useState<AvatarOptions>({
    hairStyleIndex: 0,
    eyeStyleIndex: 0,
    mouthStyleIndex: 0,
    glassesStyleIndex: 0, // Default to 'none'
    skinColorIndex: 0,
    hairColorIndex: 0,
  });

  // Function to handle option changes
  function changeOption(option: keyof AvatarOptions, direction: 'next' | 'prev') {
    setOptions(prevOptions => {
      let newIndex = 0;
      switch (option) {
        case 'hairStyleIndex':
          newIndex = cycleIndex(prevOptions.hairStyleIndex, hairStyles.length, direction);
          break;
        case 'eyeStyleIndex':
          newIndex = cycleIndex(prevOptions.eyeStyleIndex, eyeStyles.length, direction);
          break;
        case 'mouthStyleIndex':
          newIndex = cycleIndex(prevOptions.mouthStyleIndex, mouthStyles.length, direction);
          break;
        case 'glassesStyleIndex':
          newIndex = cycleIndex(prevOptions.glassesStyleIndex, glassesStyles.length, direction);
          break;
        case 'skinColorIndex':
          newIndex = cycleIndex(prevOptions.skinColorIndex, skinColors.length, direction);
          break;
        case 'hairColorIndex':
          newIndex = cycleIndex(prevOptions.hairColorIndex, hairColors.length, direction);
          break;
      }
      return { ...prevOptions, [option]: newIndex };
    });
  }

  // Add back randomize function
  function randomizeAllOptions() {
    setOptions({
      hairStyleIndex: Math.floor(Math.random() * hairStyles.length),
      eyeStyleIndex: Math.floor(Math.random() * eyeStyles.length),
      mouthStyleIndex: Math.floor(Math.random() * mouthStyles.length),
      glassesStyleIndex: Math.floor(Math.random() * glassesStyles.length),
      skinColorIndex: Math.floor(Math.random() * skinColors.length),
      hairColorIndex: Math.floor(Math.random() * hairColors.length),
    });
  }

  const avatarSvg = useMemo(() => {
    const selectedGlasses = glassesStyles[options.glassesStyleIndex];
    const finalOptions = {
      size: 256,
      skinColor: [skinColors[options.skinColorIndex]],
      hairColor: [hairColors[options.hairColorIndex]],
      hair: [hairStyles[options.hairStyleIndex]],
      eyes: [eyeStyles[options.eyeStyleIndex]],
      mouth: [mouthStyles[options.mouthStyleIndex]],
      glasses: selectedGlasses === 'none' ? undefined : [selectedGlasses],
      glassesProbability: selectedGlasses === 'none' ? 0 : 100,
    };
    console.log("Generating avatar with options:", finalOptions);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const style = adventurerCollection as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const svg = createAvatar(style, finalOptions).toString();
      console.log("Generated SVG length:", svg.length);
      // console.log("Generated SVG content:", svg); // Optional: log full SVG if length is small
      return svg;
    } catch (error) {
      console.error("Error generating avatar SVG:", error);
      return ""; // Return empty string on error
    }
  }, [options]); // Depend on the options state

  function handleNextClick() {
    // TODO: Persist the chosen options (options object)
    console.log("Chosen Avatar Options:", {
      skinColor: skinColors[options.skinColorIndex],
      hairColor: hairColors[options.hairColorIndex],
      hair: hairStyles[options.hairStyleIndex],
      eyes: eyeStyles[options.eyeStyleIndex],
      mouth: mouthStyles[options.mouthStyleIndex],
      glasses: glassesStyles[options.glassesStyleIndex],
    });
    navigate('/setup-confirm');
  }

  // OptionControl helper component - Fixed width for label span
  function OptionControl({ label, optionKey }: { label: string, optionKey: keyof AvatarOptions }) {
    return (
      <div className="flex items-center justify-between w-full max-w-xs px-3">
        <button onClick={() => changeOption(optionKey, 'prev')} className="w-12 px-4 py-2 bg-purple-300 rounded-lg text-purple-800 text-xl shadow hover:bg-purple-400 flex justify-center items-center flex-shrink-0">◀</button>
        <span className="w-24 text-lg font-medium text-purple-700 text-center mx-3 whitespace-nowrap">{label}</span>
        <button onClick={() => changeOption(optionKey, 'next')} className="w-12 px-4 py-2 bg-purple-300 rounded-lg text-purple-800 text-xl shadow hover:bg-purple-400 flex justify-center items-center flex-shrink-0">▶</button>
      </div>
    );
  }

  return (
    // Main container: Adjusted padding, ensure justify-center works well with increased size
    <div className="flex flex-col items-center justify-center h-screen bg-purple-100 p-2 md:p-4 overflow-hidden">
      {/* Title - Slightly larger margin */} 
      <h1 className="text-xl md:text-2xl font-bold text-purple-800 text-center mb-4 md:mb-6">Create Your Avatar</h1>

      {/* Main Row: Increased overall max-width and gap */} 
      <div className="flex items-center justify-center w-full max-w-xl mb-6 md:mb-8 gap-4 md:gap-6"> 
        {/* Left Controls - Increased spacing */}
        <div className="flex flex-col items-center space-y-4 w-1/3"> 
          <OptionControl label="Hair Style" optionKey="hairStyleIndex" />
          <OptionControl label="Hair Color" optionKey="hairColorIndex" />
          <OptionControl label="Skin Tone" optionKey="skinColorIndex" />
        </div>

        {/* Avatar Preview - Increased size significantly */}
        <div className="w-48 h-48 md:w-56 md:h-56 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 border-purple-300 flex-shrink-0">
          {/* Added flex centering to inner div */}
          <div dangerouslySetInnerHTML={{ __html: avatarSvg }} className="w-full h-full scale-110 flex items-center justify-center" />
        </div>

        {/* Right Controls - Increased spacing */}
        <div className="flex flex-col items-center space-y-4 w-1/3"> 
          <OptionControl label="Eyes" optionKey="eyeStyleIndex" />
          <OptionControl label="Mouth" optionKey="mouthStyleIndex" />
          <OptionControl label="Glasses" optionKey="glassesStyleIndex" />
        </div>
      </div>

      {/* Bottom Buttons - Increased size/padding/spacing */}
      <div className="flex items-center space-x-8 md:space-x-10 mt-2">
        <button
          className="px-8 py-3 bg-yellow-400 text-yellow-800 font-semibold rounded-xl shadow-md hover:bg-yellow-500 text-xl"
          onClick={randomizeAllOptions}
        >
          Randomize
        </button>
        <button
          className="px-10 py-3 bg-orange-500 text-white font-semibold rounded-xl shadow-md hover:bg-orange-600 text-xl"
          onClick={handleNextClick}
        >
          Looks Good!
        </button>
      </div>
    </div>
  )
} 