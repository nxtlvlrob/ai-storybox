import { useState, useMemo, useEffect } from 'react'
import { createAvatar } from '@dicebear/core';
import * as adventurerCollection from '@dicebear/adventurer';
import { useProfile } from '../context/profile-context';
import { updateUserProfile, uploadAvatarSvg } from '../services/firestore-service';

// --- Copied from avatar-creation-screen ---
// Define available options
const hairStyles = ['short01', 'short02', 'short03', 'short04', 'short05', 'long01', 'long02', 'long03', 'long04', 'long05'];
const eyeStyles = ['variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06', 'variant09', 'variant10', 'variant11', 'variant12'];
const mouthStyles = ['variant01', 'variant02', 'variant03', 'variant06', 'variant07', 'variant09', 'variant10', 'variant11', 'variant18', 'variant19', 'variant30'];
const glassesStyles = ['none', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05']; // Added 'none' 

const skinColors = ['f2d3b1', 'ecad80', 'e0a39e', 'd2996f', 'a56e4d', '8c5a3c', '6a4d3a']; // Example palette
const hairColors = ['2c1b18', '4a312c', '6a4e35', 'afafaf', 'e6e6e6', 'cb6820', 'dba3be', 'e5d7a0']; // Example palette

// Interface for avatar options state (using indices)
interface AvatarOptionIndices {
  hairStyleIndex: number;
  eyeStyleIndex: number;
  mouthStyleIndex: number;
  glassesStyleIndex: number;
  skinColorIndex: number;
  hairColorIndex: number;
}

// Interface for avatar options values (used for seed)
interface AvatarOptionValues {
  skinColor: string;
  hairColor: string;
  hair: string;
  eyes: string;
  mouth: string;
  glasses?: string; // Optional
}


// Helper function to cycle indices
function cycleIndex(currentIndex: number, arrayLength: number, direction: 'next' | 'prev'): number {
  if (direction === 'next') {
    return (currentIndex + 1) % arrayLength;
  } else {
    return (currentIndex - 1 + arrayLength) % arrayLength;
  }
}

// Helper to find index of a value in an array, defaulting to 0
function findIndexOrDefault(arr: string[], value?: string): number {
    const index = value ? arr.indexOf(value) : -1;
    return index === -1 ? 0 : index;
}

// --- Component Definition ---
interface AvatarCreatorProps {
    userId: string;
    currentAvatarSeed?: string | null; // JSON stringified AvatarOptionValues
    onSaveSuccess: () => void;
    mode: 'setup' | 'edit';
}

export function AvatarCreator({ 
    userId, 
    currentAvatarSeed, 
    onSaveSuccess, 
    mode 
}: AvatarCreatorProps) {
  const { refreshProfile } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Function to initialize state from seed or defaults
  function getInitialIndices(): AvatarOptionIndices {
      let initialValues: Partial<AvatarOptionValues> = {};
      if (currentAvatarSeed) {
          try {
              initialValues = JSON.parse(currentAvatarSeed) as AvatarOptionValues;
          } catch (e) {
              console.error("Failed to parse avatar seed:", e);
              // Fallback to defaults if seed is invalid
          }
      }

      return {
          hairStyleIndex: findIndexOrDefault(hairStyles, initialValues.hair),
          eyeStyleIndex: findIndexOrDefault(eyeStyles, initialValues.eyes),
          mouthStyleIndex: findIndexOrDefault(mouthStyles, initialValues.mouth),
          glassesStyleIndex: findIndexOrDefault(glassesStyles, initialValues.glasses),
          skinColorIndex: findIndexOrDefault(skinColors, initialValues.skinColor),
          hairColorIndex: findIndexOrDefault(hairColors, initialValues.hairColor),
      };
  }
  
  const [options, setOptions] = useState<AvatarOptionIndices>(getInitialIndices);

   // Effect to reset options if the seed changes (e.g., navigating between users if this were reused differently)
   useEffect(() => {
       setOptions(getInitialIndices());
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [currentAvatarSeed]);


  // Function to handle option changes
  function changeOption(option: keyof AvatarOptionIndices, direction: 'next' | 'prev') {
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
    const dicebearOptions = {
      size: 256,
      skinColor: [skinColors[options.skinColorIndex]],
      hairColor: [hairColors[options.hairColorIndex]],
      hair: [hairStyles[options.hairStyleIndex]],
      eyes: [eyeStyles[options.eyeStyleIndex]],
      mouth: [mouthStyles[options.mouthStyleIndex]],
      glasses: selectedGlasses === 'none' ? undefined : [selectedGlasses],
      glassesProbability: selectedGlasses === 'none' ? 0 : 100,
    };
    // console.log("Generating avatar with options:", dicebearOptions);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const style = adventurerCollection as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const svg = createAvatar(style, dicebearOptions).toString();
      // console.log("Generated SVG length:", svg.length);
      return svg;
    } catch (error) {
      console.error("Error generating avatar SVG:", error);
      setSaveError("Error generating avatar preview. Please try again."); // Set error state
      return ""; // Return empty string on error
    }
  }, [options]); 

  async function handleSave() {
    if (!userId) {
      setSaveError("Not authenticated. Cannot save avatar.");
      return;
    }
    if (!avatarSvg) { 
        setSaveError("Avatar generation failed. Please try changing an option or randomizing.");
        return;
    }

    setIsSaving(true);
    setSaveError(null);

    const selectedGlasses = glassesStyles[options.glassesStyleIndex];
    const currentAvatarOptions: AvatarOptionValues = {
        skinColor: skinColors[options.skinColorIndex],
        hairColor: hairColors[options.hairColorIndex],
        hair: hairStyles[options.hairStyleIndex],
        eyes: eyeStyles[options.eyeStyleIndex],
        mouth: mouthStyles[options.mouthStyleIndex],
        ...(selectedGlasses !== 'none' && { glasses: selectedGlasses }) // Conditionally add glasses
    };
    const avatarSeed = JSON.stringify(currentAvatarOptions);

    try {
      const uploadedAvatarUrl = await uploadAvatarSvg(userId, avatarSvg);
      await updateUserProfile(userId, { 
          avatarSeed: avatarSeed, 
          avatarUrl: uploadedAvatarUrl 
      });

      console.log('Avatar SVG uploaded and profile updated.');
      await refreshProfile(); 
      console.log('Profile context refreshed.');
      onSaveSuccess(); // Call the success callback provided by the parent

    } catch (error) {
      console.error("Failed to upload avatar or update profile:", error);
      setSaveError("Could not save avatar. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  // OptionControl helper component (copied and adapted)
  function OptionControl({ label, optionKey }: { label: string, optionKey: keyof AvatarOptionIndices }) {
    return (
      <div className="flex items-center justify-between w-full max-w-xs px-3">
        {/* Adjusted button styles for better fit/consistency */}
        <button onClick={() => changeOption(optionKey, 'prev')} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-purple-300 rounded-lg text-purple-800 text-xl shadow hover:bg-purple-400 flex-shrink-0">◀</button>
        <span className="w-20 md:w-24 text-base md:text-lg font-medium text-purple-700 text-center mx-2 whitespace-nowrap">{label}</span>
        <button onClick={() => changeOption(optionKey, 'next')} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-purple-300 rounded-lg text-purple-800 text-xl shadow hover:bg-purple-400 flex-shrink-0">▶</button>
      </div>
    );
  }

  const saveButtonText = mode === 'setup' ? 'Looks Good!' : 'Save Avatar';

  return (
    // Main container adjusted slightly for component usage
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-purple-800 text-center mb-4 md:mb-6">
        {mode === 'setup' ? 'Create Your Avatar' : 'Edit Your Avatar'}
      </h1>

      <div className="flex flex-col md:flex-row items-center justify-center w-full mb-6 md:mb-8 gap-4 md:gap-6"> 
        {/* Controls Column 1 */}
        <div className="flex flex-col items-center space-y-3 md:space-y-4 max-w-xs flex-grow w-full md:w-auto"> 
          <OptionControl label="Hair Style" optionKey="hairStyleIndex" />
          <OptionControl label="Hair Color" optionKey="hairColorIndex" />
          <OptionControl label="Skin Tone" optionKey="skinColorIndex" />
        </div>

        {/* Avatar Preview */}
        <div className="w-40 h-40 md:w-48 md:h-48 mx-auto md:mx-4 my-4 md:my-0 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 border-purple-300 flex-shrink-0 order-first md:order-none">
          {avatarSvg ? (
            <div dangerouslySetInnerHTML={{ __html: avatarSvg }} className="w-full h-full scale-110 flex items-center justify-center" />
          ) : (
            <div className="text-center text-xs text-red-600 p-2">Error generating preview</div>
          )}
        </div>
        
        {/* Controls Column 2 */}
        <div className="flex flex-col items-center space-y-3 md:space-y-4 max-w-xs flex-grow w-full md:w-auto"> 
          <OptionControl label="Eyes" optionKey="eyeStyleIndex" />
          <OptionControl label="Mouth" optionKey="mouthStyleIndex" />
          <OptionControl label="Glasses" optionKey="glassesStyleIndex" />
        </div>
      </div>

      {saveError && (
         <p className="text-sm text-red-600 text-center mt-2 mb-2">{saveError}</p>
      )}

      {/* Action Buttons */}
      <div className="flex items-center space-x-6 md:space-x-8 mt-2">
          <button
            className="px-6 py-2 md:px-8 md:py-3 bg-yellow-400 text-yellow-800 font-semibold rounded-xl shadow-md hover:bg-yellow-500 text-base md:text-xl disabled:opacity-50"
            onClick={randomizeAllOptions}
            disabled={isSaving}
          >
              Randomize
          </button>
          <button
            className="px-8 py-2 md:px-10 md:py-3 bg-orange-500 text-white font-semibold rounded-xl shadow-md hover:bg-orange-600 text-base md:text-xl disabled:opacity-50"
            onClick={handleSave} // Use the unified save handler
            disabled={isSaving || !avatarSvg} // Disable if saving or preview failed
          >
            {isSaving ? 'Saving...' : saveButtonText}
          </button>
      </div>
    </div>
  )
} 