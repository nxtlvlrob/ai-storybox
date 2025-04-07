import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase-config'; // Import initialized auth service

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  error: Error | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Set up the listener directly
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      console.log("Auth state changed. User:", user?.uid);
      setCurrentUser(user);
      // Set loading to false once the listener provides the initial state
      setLoading(false);
    }, (error) => {
      // Added error handler for the listener itself
      console.error("Error in onAuthStateChanged listener:", error);
      setError(error);
      setLoading(false);
    });
    
    // No initial sign-in attempt here anymore

    // Cleanup subscription on unmount
    return () => {
      unsubscribeAuth(); 
      console.log("Auth listener unsubscribed.");
    };
  }, []); // Run only once on mount

  const value: AuthContextType = {
    currentUser,
    loading,
    error,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 