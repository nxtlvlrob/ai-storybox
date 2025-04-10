import { useState, useMemo, useEffect, useCallback } from 'react'
import { createAvatar, Style } from '@dicebear/core';
import * as adventurerCollection from '@dicebear/adventurer';
import * as pixelArtCollection from '@dicebear/pixel-art';
import { useProfile } from '../context/profile-context';
import { updateUserProfile, uploadAvatarSvg, UserProfile } from '../services/firestore-service';

// --- Style Definitions Array ---

type AvatarStyleName = 'adventurer' | 'pixel-art';

// Define option keys for type safety - explicitly list all possible keys
type OptionKey = 
    | 'hair' | 'eyes' | 'mouth' | 'glasses' | 'skinColor' | 'hairColor' 
    | 'beard' | 'hat' | 'accessories' | 'clothing' | 'clothingColor' 
    | 'accessoriesColor' | 'hatColor' | 'glassesColor';

// Type for the options within a style definition
type StyleOptions = Partial<Record<OptionKey, string[]>>;

interface StyleDefinition {
    name: AvatarStyleName;
    collection: Style<object>; // Use DiceBear's Style type
    options: StyleOptions;
}

const avatarStyles: StyleDefinition[] = [
    {
        name: 'adventurer',
        collection: adventurerCollection as Style<object>,
        options: {
            hair: ['short01', 'short02', 'short03', 'short04', 'short05', 'long01', 'long02', 'long03', 'long04', 'long05'],
            eyes: ['variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06', 'variant09', 'variant10', 'variant11', 'variant12'],
            mouth: ['variant01', 'variant02', 'variant03', 'variant06', 'variant07', 'variant09', 'variant10', 'variant11', 'variant18', 'variant19', 'variant30'],
            glasses: ['none', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05'],
            skinColor: ['f2d3b1', 'ecad80', 'e0a39e', 'd2996f', 'a56e4d', '8c5a3c', '6a4d3a'],
            hairColor: ['2c1b18', '4a312c', '6a4e35', 'afafaf', 'e6e6e6', 'cb6820', 'dba3be', 'e5d7a0'],
        }
    },
    {
        name: 'pixel-art',
        collection: pixelArtCollection as Style<object>,
        options: {
            hair: ['long01', 'long02', 'long03', 'long04', 'short01', 'short02', 'short03', 'short04', 'short05', 'short06'], 
            eyes: ['variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06'], 
            mouth: [
                'happy01', 'happy02', 'happy03', 'happy04', 'happy05', 'happy06', 'happy07', 'happy08', 'happy09', 'happy10', 'happy11', 'happy12', 'happy13',
                'sad01', 'sad02', 'sad03', 'sad04', 'sad05', 'sad06', 'sad07', 'sad08', 'sad09', 'sad10'
            ], 
            glasses: [
                'none',
                'dark01', 'dark02', 'dark03', 'dark04', 'dark05', 'dark06', 'dark07',
                'light01', 'light02', 'light03', 'light04', 'light05', 'light06', 'light07'
            ], 
            beard: ['none', 'variant01', 'variant02', 'variant03'], 
            hat: ['none', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05'], 
            accessories: ['none', 'variant01', 'variant02', 'variant03'], 
            clothing: ['variant01', 'variant02', 'variant03', 'variant04', 'variant05'], 
            skinColor: ['f2d3b1', 'ecad80', 'e0a39e', 'd2996f', 'a56e4d', '8c5a3c', '6a4d3a'], // Duplicated intentionally
            hairColor: ['2c1b18', '4a312c', '6a4e35', 'afafaf', 'e6e6e6', 'cb6820', 'dba3be', 'e5d7a0'], // Duplicated intentionally
            clothingColor: ['546e7a', '78909c', '90a4ae', 'cfd8dc', 'ffccbc', 'ffab91', 'ff8a65'],
            accessoriesColor: ['ffc107', 'ff9800', 'ff5722', '795548', '607d8b'],
            hatColor: ['d32f2f', 'c2185b', '7b1fa2', '512da8', '303f9f', '1976d2'],
            glassesColor: ['37474f', '263238'],
        }
    }
];

// Helper function to find a style definition by name
function findStyleDefinition(styleName: AvatarStyleName): StyleDefinition | undefined {
    return avatarStyles.find(style => style.name === styleName);
}

// Helper function to get options for a style (returns empty object if style not found)
function getOptionsForStyle(styleName: AvatarStyleName): StyleOptions {
    return findStyleDefinition(styleName)?.options || {};
}

// Helper function to get a default configuration
function getDefaultConfig(styleName: AvatarStyleName = 'adventurer'): { style: AvatarStyleName; options: Record<string, string> } {
    const styleDefinition = findStyleDefinition(styleName) || avatarStyles[0]; // Fallback to first style
    const options = styleDefinition.options;
    const defaultOptions: Record<string, string> = {};
    for (const key in options) {
        const optionKey = key as OptionKey;
        const values = options[optionKey]; 
        if (values && values.length > 0) {
             defaultOptions[optionKey] = values[0]; // Default to the first option
        }
    }
    return { style: styleDefinition.name, options: defaultOptions };
}

// Helper function to cycle indices
function cycleIndex(currentIndex: number, arrayLength: number, direction: 'next' | 'prev'): number {
  if (direction === 'next') {
    return (currentIndex + 1) % arrayLength;
  } else {
    return (currentIndex - 1 + arrayLength) % arrayLength;
  }
}

// --- Component Definition ---
interface AvatarCreatorProps {
    userId: string;
    currentAvatarConfig?: UserProfile['avatarConfig'] | null; 
    onSaveSuccess: () => void;
    mode: 'setup' | 'edit';
}

export function AvatarCreator({ 
    userId, 
    currentAvatarConfig, 
    onSaveSuccess, 
    mode 
}: AvatarCreatorProps) {
  // State uses AvatarStyleName now
  const [avatarConfig, setAvatarConfig] = useState<{ style: AvatarStyleName; options: Record<string, string> }>(
      () => {
          if (currentAvatarConfig && currentAvatarConfig.style && currentAvatarConfig.options) {
              return { 
                  style: currentAvatarConfig.style as AvatarStyleName, // Ensure type safety
                  options: currentAvatarConfig.options 
              };
          }
          return getDefaultConfig(); 
      }
  );
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { refreshProfile } = useProfile();

  // Update state if the prop changes
  useEffect(() => {
    setAvatarConfig(() => {
        if (currentAvatarConfig && currentAvatarConfig.style && currentAvatarConfig.options) {
             // Ensure the style from the prop exists in our definitions
            const validStyle = findStyleDefinition(currentAvatarConfig.style as AvatarStyleName);
            return { 
                style: validStyle ? validStyle.name : getDefaultConfig().style, // Fallback style
                options: currentAvatarConfig.options 
            };
        }
        return getDefaultConfig(avatarConfig.style);
    });
  }, [currentAvatarConfig]); 

  // Memoize the options available for the current style
  const currentStyleOptions = useMemo(() => {
    return getOptionsForStyle(avatarConfig.style);
  }, [avatarConfig.style]);

  // Function to change an option value
  const changeOption = useCallback((optionKey: OptionKey, direction: 'next' | 'prev') => {
    const availableValues = currentStyleOptions[optionKey]; // Access directly from memoized options
    if (!availableValues || availableValues.length === 0) return; // Option doesn't exist or is empty

    const currentOptionValue = avatarConfig.options[optionKey] || availableValues[0];
    const currentIndex = availableValues.indexOf(currentOptionValue);
    const validCurrentIndex = currentIndex === -1 ? 0 : currentIndex; 

    const newIndex = cycleIndex(validCurrentIndex, availableValues.length, direction);
    const newValue = availableValues[newIndex];

    setAvatarConfig(prevConfig => ({
        ...prevConfig,
        options: {
            ...prevConfig.options,
            [optionKey]: newValue,
        },
    }));
  }, [avatarConfig.options, currentStyleOptions]);

  // Function to randomize options for the current style
  const randomizeAllOptions = useCallback(() => {
    const newOptions: Record<string, string> = {};
    for (const key in currentStyleOptions) {
        const optionKey = key as OptionKey;
        const values = currentStyleOptions[optionKey];
        if (values && values.length > 0) {
            const randomIndex = Math.floor(Math.random() * values.length);
            newOptions[optionKey] = values[randomIndex];
        }
    }
    setAvatarConfig(prevConfig => ({
        ...prevConfig,
        options: newOptions,
    }));
  }, [currentStyleOptions]);

  // Function to change the avatar style
  function changeAvatarStyle(newStyleName: AvatarStyleName) {
    setAvatarConfig(getDefaultConfig(newStyleName)); 
  }

  // Generate the SVG using the current config
  const avatarSvg = useMemo(() => {
    const { style: selectedStyleName, options: selectedOptions } = avatarConfig;
    const styleDefinition = findStyleDefinition(selectedStyleName);

    if (!styleDefinition) {
        console.error(`Style definition not found for: ${selectedStyleName}`);
        setSaveError(`Cannot generate avatar: style '${selectedStyleName}' not found.`);
        return ""; // Return empty on error
    }

    const styleCollection = styleDefinition.collection;
    const dicebearOptionsBase = { size: 256 };
    const finalOptions: Record<string, unknown> = { ...dicebearOptionsBase };
    const dicebearReadyOptions: Record<string, string[]> = {};

    for (const key in selectedOptions) {
        const value = selectedOptions[key];
        if (value && value !== 'none') {
            dicebearReadyOptions[key] = [value]; 
        }
    }

    // Apply style-specific logic (like probabilities)
    if (selectedStyleName === 'adventurer') {
      if (selectedOptions.glasses === 'none') {
        finalOptions.glassesProbability = 0;
        delete dicebearReadyOptions.glasses;
      } else {
        finalOptions.glassesProbability = 100;
      }
    } else if (selectedStyleName === 'pixel-art') {
      const pixelArtProbabilities: Record<string, number> = {};
      ['accessories', 'beard', 'glasses', 'hat'].forEach(key => {
          const optionKey = key as OptionKey;
          if (selectedOptions[optionKey] === 'none') {
              pixelArtProbabilities[`${key}Probability`] = 0;
              delete dicebearReadyOptions[key];
          } else if (selectedOptions[optionKey]) {
              pixelArtProbabilities[`${key}Probability`] = 100;
          }
      });
       Object.assign(finalOptions, pixelArtProbabilities);
    }

    Object.assign(finalOptions, dicebearReadyOptions);
    
    try {
      // createAvatar expects Style<any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svg = createAvatar(styleCollection as Style<any>, finalOptions).toString(); 
      return svg;
    } catch (error) {
      console.error(`Error generating ${selectedStyleName} avatar SVG:`, error);
      setSaveError(`Error generating avatar preview (${selectedStyleName}). Please try again.`);
      return ""; 
    }
  }, [avatarConfig]); 

  // Save the entire avatarConfig
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

    try {
      const uploadedAvatarUrl = await uploadAvatarSvg(userId, avatarSvg);
      // Ensure we save the config with the correct style name type
      const configToSave: UserProfile['avatarConfig'] = { 
          style: avatarConfig.style,
          options: avatarConfig.options
      };
      await updateUserProfile(userId, { 
          avatarConfig: configToSave, 
          avatarUrl: uploadedAvatarUrl,
      });

      console.log('Avatar SVG uploaded and profile updated with config:', configToSave);
      await refreshProfile(); 
      console.log('Profile context refreshed.');
      onSaveSuccess(); 

    } catch (error) {
      console.error("Failed to upload avatar or update profile:", error);
      setSaveError("Could not save avatar. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  // --- Generic OptionControl Component ---
  interface OptionControlProps {
    label: string;
    optionKey: OptionKey;
  }

  function OptionControl({ label, optionKey }: OptionControlProps) {
    // Check if the option key is valid for the current style
    const isEnabled = optionKey in currentStyleOptions;

    return (
      <div className={`flex items-center justify-between w-full max-w-xs px-3 ${!isEnabled ? 'opacity-30' : ''}`}>
        <button 
            onClick={() => changeOption(optionKey, 'prev')} 
            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-blue-200 rounded-lg text-blue-800 text-xl shadow hover:bg-blue-300 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={!isEnabled}
        >◀</button>
        {/* Use consistent styling, allow label width to adjust */}
        <span className="flex-1 text-base md:text-lg font-medium text-blue-800 text-center mx-2 whitespace-nowrap overflow-hidden overflow-ellipsis">{label}</span>
        <button 
            onClick={() => changeOption(optionKey, 'next')} 
            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-blue-200 rounded-lg text-blue-800 text-xl shadow hover:bg-blue-300 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={!isEnabled}
        >▶</button>
      </div>
    );
  }

  // Map Option Keys to Labels for display
  const optionLabels: Partial<Record<OptionKey, string>> = {
      hair: "Hair",
      eyes: "Eyes",
      mouth: "Mouth",
      glasses: "Glasses",
      beard: "Beard",
      hat: "Hat",
      accessories: "Accessories",
      clothing: "Clothing",
      skinColor: "Skin Tone",
      hairColor: "Hair Color",
      clothingColor: "Clothing Color",
      accessoriesColor: "Accessory Color",
      hatColor: "Hat Color",
      glassesColor: "Glasses Color",
  };

  // Define which options go into which column for layout
  const column1Options: OptionKey[] = ['hair', 'hairColor', 'skinColor'];
  const column2Options: OptionKey[] = ['eyes', 'mouth', 'glasses'];

  // Filter options based on the current style for rendering
  const availableColumn1Options = column1Options.filter(key => key in currentStyleOptions);
  const availableColumn2Options = column2Options.filter(key => key in currentStyleOptions);

  const saveButtonText = mode === 'setup' ? 'Looks Good!' : 'Save Avatar';

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-blue-800 text-center mb-4 md:mb-6">
        {mode === 'setup' ? 'Create Your Avatar' : 'Edit Your Avatar'}
      </h1>
      
      {/* Style Selector - Iterate over avatarStyles */}
      <div className="flex justify-center space-x-3 mb-4">
        {avatarStyles.map(styleDef => (
          <button
            key={styleDef.name}
            onClick={() => changeAvatarStyle(styleDef.name)}
            className={`px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              avatarConfig.style === styleDef.name 
                ? 'bg-blue-600 text-white shadow ring-blue-500' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 ring-gray-400'
            }`}
          >
            {/* Capitalize style name for display */}
            {styleDef.name.charAt(0).toUpperCase() + styleDef.name.slice(1).replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Main Layout: Controls - Avatar - Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-center w-full mb-6 md:mb-8 gap-4 md:gap-6"> 
        
        {/* Controls Column 1 */}
        <div className="flex flex-col items-center space-y-3 md:space-y-4 max-w-xs flex-grow w-full md:w-auto order-last md:order-first"> 
          {availableColumn1Options.map(key => (
            <OptionControl key={key} label={optionLabels[key] || key} optionKey={key} />
          ))}
        </div>

        {/* Avatar Preview */}
        <div className="w-40 h-40 md:w-48 md:h-48 mx-auto md:mx-4 my-4 md:my-0 bg-white rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 border-blue-300 flex-shrink-0 order-first md:order-none">
          {avatarSvg ? (
            <div dangerouslySetInnerHTML={{ __html: avatarSvg }} className="w-full h-full scale-110 flex items-center justify-center" />
          ) : (
            <div className="text-center text-xs text-red-600 p-2">Error generating preview</div>
          )}
        </div>
        
        {/* Controls Column 2 */}
        <div className="flex flex-col items-center space-y-3 md:space-y-4 max-w-xs flex-grow w-full md:w-auto order-last md:order-last"> 
          {availableColumn2Options.map(key => (
            <OptionControl key={key} label={optionLabels[key] || key} optionKey={key} />
          ))}
        </div>
      </div>

      {/* Bottom Controls - Randomize and Save */}
      <div className="flex flex-col items-center mt-4 md:mt-6 w-full max-w-xs">
        <button 
          onClick={randomizeAllOptions}
          // Always enabled, just randomizes the current style's options
          className="mb-3 px-4 py-2 w-full rounded-lg shadow text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 bg-gray-200 text-gray-700 hover:bg-gray-300 ring-gray-400"
        >
          🎲 Randomize Features
        </button>

        {/* Display Save Error */}
        {saveError && (
          <p className="text-sm text-red-600 text-center mb-2">{saveError}</p>
        )}

        {/* Save button */}
        <button
          className="w-full px-5 py-2.5 sm:px-6 sm:py-3 bg-blue-600 text-white text-sm sm:text-base font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-blue-100 disabled:opacity-50"
          onClick={handleSave}
          disabled={isSaving || !avatarSvg} 
        >
          {isSaving ? 'Saving...' : saveButtonText}
        </button>
      </div>
    </div>
  )
} 