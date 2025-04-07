import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import Keyboard, { SimpleKeyboard } from 'react-simple-keyboard'
import { useAuth } from '../context/auth-context'
import { updateUserProfile } from '../services/firestore-service'

import 'react-datepicker/dist/react-datepicker.css'
import 'react-simple-keyboard/build/css/index.css'

// Define the updated structure for profile data
interface ProfileData {
  name: string;
  birthday: Date | null; // Changed from age string to Date object or null
  gender?: 'boy' | 'girl'; // Optional field remains
}

export function ProfileSetupScreen() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<ProfileData>({
    name: '',
    birthday: null, // Initialize birthday as null
    gender: undefined,
  });
  // State to manage which input is focused (for keyboard)
  const [inputFocus, setInputFocus] = useState<string | null>(null);
  const [keyboardLayout, setKeyboardLayout] = useState('default'); // For potential layout changes
  const keyboardRef = useRef<SimpleKeyboard | null>(null); // Use Keyboard component type for ref

  // Handler to update state for text inputs (Name)
  function handleInputChange(value: string) {
    const previousLength = profileData.name.length;
    if (inputFocus === 'name') {
      setProfileData(prevData => ({ ...prevData, name: value }));
      // If first character typed, switch back to default layout
      if (previousLength === 0 && value.length === 1) {
        setKeyboardLayout('default');
      }
    }
  }

  // Handler for keyboard events (e.g., Shift, CapsLock)
  function handleKeyPress(button: string) {
    console.log("Button pressed:", button);
    // Handle layout changes like shift/caps
    if (button === "{shift}" || button === "{lock}") {
      handleShift();
    } else if (button === "{done}") {
      // Handle hiding keyboard
      setInputFocus(null);
    } else if (button === "{backspace}") {
      // onChange handles backspace, this is just for logging/debugging if needed
    }
  }

  function handleShift() {
    const currentLayout = keyboardLayout;
    const shiftToggle = currentLayout === "default" ? "shift" : "default";
    console.log(`Switching layout to: ${shiftToggle}`);
    setKeyboardLayout(shiftToggle);
  }

  // Function to show the keyboard and set initial layout
  function showKeyboard() {
    // Default to shift layout if input is empty, otherwise default
    setKeyboardLayout(profileData.name.length === 0 ? 'shift' : 'default');
    setInputFocus('name');
  }

  // Effect to sync keyboard state with external state changes
  useEffect(() => {
    if (inputFocus === 'name' && keyboardRef.current) {
      // Use setInput inside setTimeout to ensure keyboard is ready
      const timer = setTimeout(() => {
        if (keyboardRef.current) { // Check ref again inside timeout
           (keyboardRef.current as SimpleKeyboard).setInput(profileData.name);
        }
      }, 0); // 0ms delay pushes to end of event loop

      // Cleanup function to clear timeout if component unmounts or dependencies change
      return () => clearTimeout(timer);
    }
  }, [profileData.name, inputFocus]); // Dependencies remain the same

  // Handler for DatePicker change
  function handleBirthdayChange(date: Date | null) {
    setProfileData(prevData => ({ ...prevData, birthday: date }));
    setInputFocus(null); // Hide keyboard when changing date
  }

  // Handler for gender selection
  function handleGenderSelect(selectedGender: 'boy' | 'girl') {
    setProfileData(prevData => ({ ...prevData, gender: selectedGender }));
    setInputFocus(null); // Hide keyboard when selecting gender
  }

  function handleSkipGender() {
    setProfileData(prevData => ({ ...prevData, gender: undefined }));
    setInputFocus(null); // Hide keyboard when skipping gender
  }

  // Update handleNextClick to save data
  async function handleNextClick() {
    if (!currentUser) {
      setSaveError("Not authenticated. Cannot save profile.");
      return;
    }
    if (!profileData.name || !profileData.birthday) {
        setSaveError("Please enter your name and birthday.");
        return;
    }

    setInputFocus(null); 
    setIsSaving(true);
    setSaveError(null);

    const dataToSave = {
      name: profileData.name,
      birthday: profileData.birthday, 
      gender: profileData.gender, // Will be undefined if skipped
    };

    try {
      await updateUserProfile(currentUser.uid, dataToSave);
      console.log('Profile data saved, navigating to avatar setup...');
      navigate('/setup-avatar');
    } catch (error) {
      console.error("Failed to save profile data:", error);
      setSaveError("Could not save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-between h-screen bg-yellow-100 overflow-hidden">
      {/* Form Area - Use flex-grow to take available space, allow potential shrinking if needed */}
      {/* Added overflow-y-auto and max-h-[calc(100vh-SOME_KEYBOARD_HEIGHT)] IF we needed scrolling when keyboard is up */} 
      {/* Let's try without scrolling first */}
      <div className="w-full max-w-md flex-grow flex flex-col justify-center pt-2 pb-1"> {/* Reduced padding top/bottom */} 
        <h1 className="text-2xl md:text-3xl font-bold mb-4 text-yellow-800 text-center"> {/* Reduced text size and margin */} 
          Tell Us About You!
        </h1>
        
        {/* Reduced internal spacing with space-y-4 */}
        <div className="w-full space-y-4 bg-white p-4 rounded-lg shadow-md" onClick={() => setInputFocus(null)} > {/* Reduced padding */} 
          
          {/* Name Input Display */}
          <div onClick={(e) => e.stopPropagation()} >
            {/* Reduced label size and margin */}
            <label htmlFor="name-display" className="block text-base font-medium text-gray-700 mb-1">Name</label>
            <div 
              id="name-display"
              onClick={showKeyboard} 
              // Reduced padding and text size
              className={`w-full px-3 py-2 border rounded-lg text-base cursor-text ${inputFocus === 'name' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'} ${!profileData.name ? 'text-gray-400' : 'text-gray-900'}`}
            >
              {profileData.name || "Tap to enter name"}
            </div>
          </div>

          {/* Birthday Input */}
           <div onClick={(e) => e.stopPropagation()}> 
             {/* Reduced label size and margin */}
            <label htmlFor="birthday" className="block text-base font-medium text-gray-700 mb-1">Birthday</label>
            <DatePicker 
              id="birthday"
              selected={profileData.birthday}
              onChange={handleBirthdayChange}
              onFocus={() => setInputFocus(null)} 
              dateFormat="MMMM d, yyyy"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-blue-500 focus:border-blue-500"
              placeholderText="Select a date"
              maxDate={new Date()} 
              withPortal
              popperPlacement="top-start"
              showYearDropdown
              dropdownMode="select"
            />
          </div>

          {/* Gender Selection */}
           <div onClick={(e) => e.stopPropagation()}> 
             {/* Reduced label size and margin */}
            <label className="block text-base font-medium text-gray-700 mb-1">Gender (Optional)</label>
             {/* Reduced button padding and text size */} 
            <div className="flex space-x-2"> {/* Reduced space between buttons */} 
              <button 
                onClick={() => handleGenderSelect('boy')}
                className={`flex-1 py-2 px-3 rounded-lg text-base font-semibold border-2 ${profileData.gender === 'boy' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-blue-500 border-blue-300 hover:bg-blue-50'}`}
              >
                Boy
              </button>
              <button 
                onClick={() => handleGenderSelect('girl')}
                className={`flex-1 py-2 px-3 rounded-lg text-base font-semibold border-2 ${profileData.gender === 'girl' ? 'bg-pink-500 text-white border-pink-600' : 'bg-white text-pink-500 border-pink-300 hover:bg-pink-50'}`}
              >
                Girl
              </button>
              <button 
                onClick={handleSkipGender}
                className={`py-2 px-3 rounded-lg text-base font-semibold border-2 ${profileData.gender === undefined ? 'bg-gray-500 text-white border-gray-600' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-100'}`}
              >
                Skip
              </button>
            </div>
          </div>

          {/* Display Save Error */}
          {saveError && (
            <p className="text-sm text-red-600 text-center mt-2">{saveError}</p>
          )}

        </div>
        
        {/* Navigation Button - Updated text/disabled state */}
         <button 
          className="mt-5 mb-2 self-center px-6 py-2 bg-blue-500 text-white text-lg font-semibold rounded-lg shadow-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-yellow-100 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleNextClick}
          disabled={isSaving} // Disable while saving
        >
          {isSaving ? 'Saving...' : 'Next: Create Avatar'} 
        </button>
      </div>

      {/* Keyboard Area - Remains the same */} 
      {/* ... (Keyboard component code) ... */} 
      <div className={`w-full sticky bottom-0 transition-all duration-300 ease-in-out ${inputFocus === 'name' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        {inputFocus === 'name' && (
          <Keyboard
            keyboardRef={(r: SimpleKeyboard) => (keyboardRef.current = r)} 
            layoutName={keyboardLayout}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            inputName="name" 
            value={profileData.name} 
            layout={{
              'default': [
                'q w e r t y u i o p',
                'a s d f g h j k l',
                '{shift} z x c v b n m {backspace}',
                '{space} {done}'
              ],
              'shift': [
                'Q W E R T Y U I O P',
                'A S D F G H J K L',
                '{shift} Z X C V B N M {backspace}',
                '{space} {done}'
              ]
            }}
            display={{
              '{done}': 'Done',
              '{shift}': '⇧',
              '{space}': ' ',
              '{backspace}': '⌫'
            }}
            theme={"hg-theme-default hg-layout-default my-keyboard-theme"} 
            buttonTheme={[
              {
                class: "shift-key", 
                buttons: "{shift}"
              },
              {
                class: "hg-activeButton", 
                buttons: keyboardLayout === 'shift' ? "{shift}" : "" 
              }
            ]}
          />
        )}
      </div>
    </div>
  )
} 