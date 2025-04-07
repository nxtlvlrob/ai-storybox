import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context'; // To get the current user
import { getUserProfile, UserProfile } from '../services/firestore-service'; // To fetch profile

interface ProfileContextType {
  userProfile: UserProfile | null;
  profileLoading: boolean;
  profileError: Error | null;
  refreshProfile: () => Promise<void>;
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

  // Memoize the fetch function using useCallback
  const fetchProfile = useCallback(async () => {
    if (!currentUser?.uid) {
      setUserProfile(null);
      setProfileLoading(false);
      setProfileError(null);
      return; // Exit if no user ID
    }

    setProfileLoading(true);
    setProfileError(null);
    console.log(`ProfileProvider: Fetching profile for ${currentUser.uid}...`);
    try {
      const profile = await getUserProfile(currentUser.uid);
      console.log("ProfileProvider: Profile data received:", profile);
      setUserProfile(profile);
    } catch (err) {
      console.error("ProfileProvider: Error fetching profile:", err);
      setProfileError(err as Error);
      setUserProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, [currentUser]); // Depend on currentUser

  // Initial fetch on currentUser change
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]); // Depend on the memoized fetch function

  // Expose refresh function (which is just fetchProfile)
  const refreshProfile = fetchProfile;

  const value: ProfileContextType = {
    userProfile,
    profileLoading,
    profileError,
    refreshProfile, // Expose the refresh function
  };

  // Provide the context value to children
  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
} 