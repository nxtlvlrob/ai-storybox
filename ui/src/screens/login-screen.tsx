import { useState, useRef, useEffect } from 'react';
import { signInWithEmailAndPassword, AuthError } from 'firebase/auth';
import { auth } from '../firebase-config';
import Keyboard from 'react-simple-keyboard';
import { SimpleKeyboard } from "react-simple-keyboard";

// Assuming react-simple-keyboard CSS is imported globally in index.css

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Keyboard state
  const [inputFocus, setInputFocus] = useState<'email' | 'password' | null>(null);
  const [keyboardLayout, setKeyboardLayout] = useState('default');
  const keyboardRef = useRef<SimpleKeyboard | null>(null);

  // Login handler
  async function handleLogin(event?: React.FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setLoginError(null);
    setInputFocus(null); // Hide keyboard on submit
    try {
      console.log(`Attempting login for ${email}...`);
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Login successful!");
    } catch (error) {
      console.error("Login failed:", error);
      if (error instanceof Error) {
        const errorCode = (error as AuthError).code;
        switch (errorCode) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            setLoginError("Incorrect email or password.");
            break;
          case 'auth/invalid-email':
            setLoginError("Please enter a valid email address.");
            break;
          default:
            setLoginError(error.message || 'An unexpected error occurred.');
        }
      } else {
        setLoginError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  }

  // --- Keyboard Handlers --- 
  function handleInputChange(value: string) {
    if (inputFocus === 'email') {
      setEmail(value);
    } else if (inputFocus === 'password') {
      setPassword(value);
    }
  }

  function handleKeyPress(button: string) {
    if (button === "{shift}" || button === "{lock}") handleShift();
    if (button === "{enter}") handleLogin();
    if (button === "{done}") setInputFocus(null);
  }

  function handleShift() {
    setKeyboardLayout(prev => prev === "default" ? "shift" : "default");
  }

  function showKeyboard(inputType: 'email' | 'password') {
    setInputFocus(inputType);
    setKeyboardLayout('default'); 
  }

  // Effect to sync keyboard with input state
  useEffect(() => {
    if (inputFocus && keyboardRef.current) {
      const currentValue = inputFocus === 'email' ? email : password;
      const timer = setTimeout(() => {
         if (keyboardRef.current) {
           keyboardRef.current.setInput(currentValue);
         }
      }, 0); 
      return () => clearTimeout(timer);
    }
  }, [inputFocus, email, password]);

  return (
    <div className="flex flex-col items-center justify-between h-screen bg-sky-100 overflow-hidden">
      {/* Login Form Area */} 
      <form onSubmit={handleLogin} className="w-full max-w-sm flex-grow flex flex-col justify-center pt-4 pb-2">
        <h1 className="text-2xl font-bold text-sky-800 text-center mb-6">Storybox Sign In</h1>
        
        <div className="space-y-4 bg-white p-5 rounded-lg shadow-md">
          {/* Email Input Display */} 
          <div>
            <label className="block text-base font-medium text-gray-700 mb-1">Email</label>
            <div 
              onClick={() => showKeyboard('email')} 
              className={`w-full px-3 py-2 border rounded-lg text-base cursor-text ${inputFocus === 'email' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'} ${!email ? 'text-gray-400' : 'text-gray-900'}`}
            >
              {email || "Tap to enter email"}
            </div>
          </div>

          {/* Password Input Display */} 
          <div>
            <label className="block text-base font-medium text-gray-700 mb-1">Password</label>
            <div 
              onClick={() => showKeyboard('password')} 
              className={`w-full px-3 py-2 border rounded-lg text-base cursor-text ${inputFocus === 'password' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'}`}
            >
              {password ? '*'.repeat(password.length) : "Tap to enter password"}
            </div>
          </div>

          {loginError && (
            <p className="text-sm text-red-600 text-center mt-2">{loginError}</p>
          )}
        </div>

        <button 
          type="submit"
          disabled={loading || !email || !password}
          className="mt-6 mb-2 self-center px-8 py-3 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-sky-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>

      {/* Keyboard Area */} 
      <div className={`w-full sticky bottom-0 transition-all duration-300 ease-in-out ${inputFocus ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        {inputFocus && (
          <Keyboard
            keyboardRef={(r: SimpleKeyboard) => (keyboardRef.current = r)} 
            layoutName={keyboardLayout}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            layout={{
              'default': [
                '1 2 3 4 5 6 7 8 9 0',
                'q w e r t y u i o p',
                'a s d f g h j k l @',
                '{shift} z x c v b n m . com {backspace}',
                '{space} {done}'
              ],
              'shift': [
                '! " £ $ % ^ & * ( )' ,
                'Q W E R T Y U I O P',
                'A S D F G H J K L @',
                '{shift} Z X C V B N M _ - {backspace}',
                '{space} {done}'
              ]
            }}
            display={{
              '{enter}': 'Enter', '{shift}': '⇧', '{space}': ' ', '{backspace}': '⌫', '{done}': 'Hide'
            }}
            theme={"hg-theme-default hg-layout-default my-keyboard-theme"} 
            inputName={inputFocus}
          />
        )}
      </div>
    </div>
  );
} 