import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Define the structure for topic suggestions (matching the backend)
interface TopicSuggestion {
    text: string;
    emojis: string; // String containing 1-2 emojis
}

// TODO: Initialize Firebase if not done globally
// import { initializeApp } from "firebase/app";
// const firebaseConfig = { /* Your config */ };
// initializeApp(firebaseConfig);

export function CreateStoryScreen() {
  const navigate = useNavigate();
  const functionsInstance = getFunctions(); // Get functions instance

  // Update state to hold TopicSuggestion objects
  const [topics, setTopics] = useState<TopicSuggestion[]>([]); 
  const [isLoadingTopics, setIsLoadingTopics] = useState<boolean>(true);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  // Function to fetch topics
  async function fetchTopics() {
    setIsLoadingTopics(true);
    setTopicsError(null);
    console.log("Calling generateTopics function...");

    try {
      const generateTopics = httpsCallable(functionsInstance, 'generateTopics');
      const result = await generateTopics();
      // Update type casting for the new structure
      const data = result.data as TopicSuggestion[]; 
      console.log("Received topics:", data);
      // Validate data structure minimally (more robust checks could be added)
      if (Array.isArray(data) && data.every(t => t && typeof t.text === 'string' && typeof t.emojis === 'string')) {
          setTopics(data);
      } else {
          console.error("Received invalid topic data structure:", data);
          throw new Error("Invalid data format received from server.")
      }
    } catch (error: unknown) {
      console.error("Error fetching topics:", error);
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
          errorMessage = error; // Handle string errors
      }
      setTopicsError(`Failed to load topics: ${errorMessage}`);
    } finally {
      setIsLoadingTopics(false);
    }
  }

  // Fetch topics when component mounts
  useEffect(() => {
    fetchTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures it runs only once on mount


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-100 p-4">
      <h1 className="text-3xl font-bold mb-4 text-gray-800">Create a New Story</h1>
      {/* TODO: Add theme/preference selection */}
      <p className="mb-6 text-lg text-gray-700">First, choose a topic to spark your imagination:</p>

      {/* Loading State */}
      {isLoadingTopics && (
        <div className="animate-pulse text-gray-600">Loading topics...</div>
      )}

      {/* Error State */}
      {topicsError && (
        <div className="text-red-600 bg-red-100 p-3 rounded mb-4">{topicsError}</div>
      )}

      {/* Topic Selection UI - Updated to show emojis and text */}
      {!isLoadingTopics && !topicsError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 w-full max-w-md">
          {topics.map((topic, index) => (
            <button 
              key={index} 
              className="flex flex-col items-center justify-center p-4 bg-purple-500 text-white rounded-lg shadow-md hover:bg-purple-600 transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75 h-32 text-center"
              // TODO: Add onClick handler to select the topic object
            >
              <span className="text-4xl mb-2">{topic.emojis}</span>
              <span className="text-sm font-medium">{topic.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* TODO: Add story length selection */} 
      {/* TODO: Add button to trigger story generation */}

      <button 
        className="absolute top-4 left-4 px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400 text-sm"
        onClick={() => navigate('/home')} // Go back home
      >
        Back to Home
      </button>
    </div>
  )
} 