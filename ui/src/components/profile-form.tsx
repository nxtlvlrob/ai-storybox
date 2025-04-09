import { useState, useRef, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import Keyboard, { SimpleKeyboard } from 'react-simple-keyboard'
import { User } from 'firebase/auth' // Assuming User type import if needed
import { updateUserProfile } from '../services/firestore-service'

import 'react-datepicker/dist/react-datepicker.css'
import 'react-simple-keyboard/build/css/index.css'

// Define the structure for profile data
interface ProfileData {
  name: string;
  birthday: Date | null;
  gender?: 'boy' | 'girl';
}

interface ProfileFormProps {
  currentUser: User | null; // Pass current user
  initialProfileData?: Partial<ProfileData>; // Optional initial data for editing
  onSaveSuccess: () => void; // Callback on successful save
  refreshProfile: () => Promise<void>; // Function to refresh profile context
  mode: 'setup' | 'edit'; // Mode to control button text and behavior
}

export function ProfileForm({
  currentUser,
  initialProfileData = { name: '', birthday: null, gender: undefined },
  onSaveSuccess,
  refreshProfile,
  mode,
}: ProfileFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>({
    name: initialProfileData.name || '',
    birthday: initialProfileData.birthday || null,
    gender: initialProfileData.gender, // Keep initial gender or undefined
  });
  const [inputFocus, setInputFocus] = useState<string | null>(null);
  const [keyboardLayout, setKeyboardLayout] = useState('default');
  const keyboardRef = useRef<SimpleKeyboard | null>(null);

  // Initialize keyboard layout based on initial name
  useEffect(() => {
    setKeyboardLayout(profileData.name.length === 0 ? 'shift' : 'default');
  }, []); // Run only once on mount

  function handleInputChange(value: string) {
    const previousLength = profileData.name.length;
    if (inputFocus === 'name') {
      setProfileData(prevData => ({ ...prevData, name: value }));
      if (previousLength === 0 && value.length === 1) {
        setKeyboardLayout('default');
      }
    }
  }

  function handleKeyPress(button: string) {
    if (button === "{shift}" || button === "{lock}") {
      handleShift();
    } else if (button === "{done}") {
      setInputFocus(null);
    }
  }

  function handleShift() {
    const currentLayout = keyboardLayout;
    const shiftToggle = currentLayout === "default" ? "shift" : "default";
    setKeyboardLayout(shiftToggle);
  }

  function showKeyboard() {
    setKeyboardLayout(profileData.name.length === 0 ? 'shift' : 'default');
    setInputFocus('name');
  }

  useEffect(() => {
    if (inputFocus === 'name' && keyboardRef.current) {
      const timer = setTimeout(() => {
        if (keyboardRef.current) {
           (keyboardRef.current as SimpleKeyboard).setInput(profileData.name);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [profileData.name, inputFocus]);

  function handleBirthdayChange(date: Date | null) {
    setProfileData(prevData => ({ ...prevData, birthday: date }));
    setInputFocus(null);
  }

  function handleGenderSelect(selectedGender: 'boy' | 'girl') {
    setProfileData(prevData => ({ ...prevData, gender: selectedGender }));
    setInputFocus(null);
  }

  function handleSkipGender() {
    setProfileData(prevData => ({ ...prevData, gender: undefined }));
    setInputFocus(null);
  }

  async function handleSave() {
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
      gender: profileData.gender,
    };

    try {
      await updateUserProfile(currentUser.uid, dataToSave);
      console.log('Profile data saved.');
      await refreshProfile();
      console.log('Profile context refreshed.');
      onSaveSuccess(); // Call the success callback
    } catch (error) {
      console.error("Failed to save profile data:", error);
      setSaveError("Could not save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  // Determine button text based on mode
  const saveButtonText = mode === 'setup' ? 'Next: Create Avatar' : 'Save Changes';

  return (
    // Removed outer container, assuming parent will handle layout
    <div className="w-full flex flex-col items-center flex-grow justify-center">
      {/* Form Area */}
      <div className="w-full max-w-md flex-grow flex flex-col justify-center pt-2 pb-1">
        {mode === 'setup' && (
           <h1 className="text-2xl md:text-3xl font-bold mb-4 text-blue-800 text-center">
             Tell Us About You!
           </h1>
        )}
        <div className="w-full space-y-4 bg-white p-4 rounded-lg shadow-md" onClick={() => setInputFocus(null)}>
          {/* Name Input Display */}
          <div onClick={(e) => e.stopPropagation()}>
            <label htmlFor="name-display" className="block text-base font-medium text-gray-700 mb-1">Name</label>
            <div
              id="name-display"
              onClick={showKeyboard}
              className={`w-full px-3 py-2 border rounded-lg text-base cursor-text ${inputFocus === 'name' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'} ${!profileData.name ? 'text-gray-400' : 'text-gray-900'}`}
            >
              {profileData.name || "Tap to enter name"}
            </div>
          </div>

          {/* Birthday Input */}
           <div onClick={(e) => e.stopPropagation()}>
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
            <label className="block text-base font-medium text-gray-700 mb-1">Gender (Optional)</label>
            <div className="flex space-x-2">
              <button
                onClick={() => handleGenderSelect('boy')}
                className={`flex-1 py-2 px-3 rounded-lg text-base font-semibold border-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 ${profileData.gender === 'boy' ? 'bg-blue-500 text-white border-blue-600 focus:ring-blue-400' : 'bg-white text-blue-500 border-blue-300 hover:bg-blue-50 focus:ring-blue-300'}`}
              >
                Boy
              </button>
              <button
                onClick={() => handleGenderSelect('girl')}
                className={`flex-1 py-2 px-3 rounded-lg text-base font-semibold border-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 ${profileData.gender === 'girl' ? 'bg-pink-500 text-white border-pink-600 focus:ring-pink-400' : 'bg-white text-pink-500 border-pink-300 hover:bg-pink-50 focus:ring-pink-300'}`}
              >
                Girl
              </button>
              <button
                onClick={handleSkipGender}
                className={`py-2 px-3 rounded-lg text-base font-semibold border-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 ${profileData.gender === undefined ? 'bg-gray-500 text-white border-gray-600 focus:ring-gray-400' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-100 focus:ring-gray-300'}`}
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

        {/* Save Button */}
         <button
          className="mt-5 mb-2 self-center px-5 py-2.5 sm:px-6 sm:py-3 bg-blue-600 text-white text-sm sm:text-base font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSave} // Changed from handleNextClick
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : saveButtonText}
        </button>
      </div>

      {/* Keyboard Area */}
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
            theme={"hg-theme-default hg-layout-default myTheme"}
            display={{
              '{shift}': 'Shift',
              '{lock}': 'Caps',
              '{space}': 'Space',
              '{backspace}': '←',
              '{done}': 'Done'
            }}
            buttonTheme={[
               { class: "key-standard", buttons: "q w e r t y u i o p a s d f g h j k l z x c v b n m Q W E R T Y U I O P A S D F G H J K L Z X C V B N M" },
               { class: "key-special", buttons: "{shift} {lock} {space} {backspace} {done}" }
            ]}
            // Limit keyboard width on larger screens if needed
            // baseClass="max-w-screen-md mx-auto" 
          />
        )}
      </div>
    </div>
  );
} 