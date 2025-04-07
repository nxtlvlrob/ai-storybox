import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './auth-context'; // To get the current user
import { getUserProfile, UserProfile } from '../services/firestore-service'; // To fetch profile

interface ProfileContextType {
  userProfile: UserProfile | null;
  profileLoading: boolean;
  profileError: Error | null;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

interface ProfileProviderProps {
  children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { currentUser } = useAuth(); // Get the authenticated user
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<Error | null>(null);

  useEffect(() => {
    // Fetch profile when currentUser is available
    if (currentUser?.uid) {
      setProfileLoading(true);
      setProfileError(null);
      console.log(`ProfileProvider: User ${currentUser.uid} detected. Fetching profile...`);
      getUserProfile(currentUser.uid)
        .then(profile => {
          console.log("ProfileProvider: Profile data received:", profile);
          setUserProfile(profile); // Set profile (null if not found)
        })
        .catch(err => {
          console.error("ProfileProvider: Error fetching profile:", err);
          setProfileError(err as Error);
          setUserProfile(null); // Clear profile on error
        })
        .finally(() => {
          setProfileLoading(false);
        });
    } else {
      // No user, reset profile state
      setUserProfile(null);
      setProfileLoading(false);
      setProfileError(null);
    }
  }, [currentUser]); // Re-run when currentUser changes

  const value: ProfileContextType = {
    userProfile,
    profileLoading,
    profileError,
  };

  // Provide the context value to children
  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
} 