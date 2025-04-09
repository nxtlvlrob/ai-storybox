import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { useAuth } from './auth-context'; // Assuming you have an AuthContext

// Define the structure for topic suggestions (matching the backend)
interface TopicSuggestion {
    text: string;
    emojis: string; // String containing 1-2 emojis
}

interface TopicsContextType {
  topics: TopicSuggestion[];
  isLoadingTopics: boolean;
  topicsError: string | null;
  fetchTopics: () => Promise<void>;
}

const TopicsContext = createContext<TopicsContextType | undefined>(undefined);

interface TopicsProviderProps {
  children: ReactNode;
}

export function TopicsProvider({ children }: TopicsProviderProps) {
  const [topics, setTopics] = useState<TopicSuggestion[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState<boolean>(false); // Start as false, only true when fetching
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState<boolean>(false); // Track if initial fetch occurred

  const { currentUser } = useAuth(); // Get user from AuthContext
  const functionsInstance = getFunctions(); // Get functions instance
  const authInstance = getAuth(); // Get Auth instance

  const fetchTopics = useCallback(async () => {
    if (isLoadingTopics || !currentUser) {
      console.log("Skipping fetchTopics call. Loading:", isLoadingTopics, "User:", !!currentUser);
      return;
    }
    
    console.log("TopicsContext: Calling generateTopics function...");
    setIsLoadingTopics(true);
    setTopicsError(null);

    try {
        // Ensure user is logged in (redundant check, but safe)
        if (!authInstance.currentUser) {
            throw new Error("User must be logged in to fetch topics.");
        }
        const generateTopics = httpsCallable(functionsInstance, 'generateTopics');
        const result = await generateTopics();
        const data = result.data as TopicSuggestion[];
        console.log("TopicsContext: Received topics:", data);
        
        if (Array.isArray(data) && data.every(t => t && typeof t.text === 'string' && typeof t.emojis === 'string')) {
            setTopics(data);
            setHasFetched(true); // Mark fetch as having occurred (at least once successfully)
            setTopicsError(null); // Clear any previous error on success
        } else {
            console.error("TopicsContext: Received invalid topic data structure:", data);
            throw new Error("Invalid data format received from server.")
        }
    } catch (error: unknown) {
        console.error("TopicsContext: Error fetching topics:", error);
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        setTopicsError(`Failed to load topics: ${errorMessage}`);
        setHasFetched(false); // Allow initial fetch to retry if subsequent refresh fails? Or keep true? Let's keep true for now.
        // If an initial fetch fails, hasFetched remains false, allowing useEffect to try again if deps change.
        // If a refresh fetch fails, we show error, but hasFetched remains true.
    } finally {
        setIsLoadingTopics(false);
    }
  // Removed hasFetched from dependencies, as its check is now internal to the effect
  }, [functionsInstance, authInstance, currentUser, isLoadingTopics]);

  // Effect to trigger the *initial* fetch once user is available and fetch hasn't happened
  useEffect(() => {
    if (currentUser && !hasFetched && !isLoadingTopics) {
      console.log("TopicsContext: Triggering initial topic fetch.");
      fetchTopics();
    }
    // Dependencies: run if user logs in, or if fetch attempt fails (isLoadingTopics becomes false)
  }, [currentUser, hasFetched, isLoadingTopics, fetchTopics]);

  const value = {
    topics,
    isLoadingTopics,
    topicsError,
    fetchTopics, // Expose fetchTopics for manual refresh
  };

  return <TopicsContext.Provider value={value}>{children}</TopicsContext.Provider>;
}

export function useTopics(): TopicsContextType {
  const context = useContext(TopicsContext);
  if (context === undefined) {
    throw new Error('useTopics must be used within a TopicsProvider');
  }
  return context;
} 