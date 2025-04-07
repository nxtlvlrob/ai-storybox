import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Assuming types are defined in a shared types file
// Adjust path if necessary
import type { StoryDocument, StoryStatus } from '../../../types';

// Helper to format status messages
function formatStatus(status: StoryStatus): string {
  if (status === 'queued') return 'Waiting to start...';
  if (status === 'planning') return 'Planning the story...';
  if (status === 'complete') return 'Story Complete!';
  if (status === 'error') return 'An error occurred.';
  if (status.startsWith('generating_text_')) {
    const index = status.split('_')[2];
    return `Writing section ${parseInt(index, 10) + 1}...`;
  }
  if (status.startsWith('generating_image_')) {
    const index = status.split('_')[2];
    return `Creating illustration for section ${parseInt(index, 10) + 1}...`;
  }
  if (status.startsWith('generating_audio_')) {
    const index = status.split('_')[2];
    return `Recording audio for section ${parseInt(index, 10) + 1}...`;
  }
  return 'Processing...'; // Fallback
}

export function StoryViewerScreen() {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();
  const firestore = getFirestore();
  const auth = getAuth();

  const [story, setStory] = useState<StoryDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!storyId) {
      setError('No story ID provided.');
      setIsLoading(false);
      return;
    }

    if (!auth.currentUser) {
      setError('You must be logged in to view stories.');
      setIsLoading(false);
      // Optional: Redirect to login
      // navigate('/login'); 
      return;
    }

    const storyRef = doc(firestore, 'stories', storyId);
    
    const unsubscribe = onSnapshot(storyRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as StoryDocument;
          // Basic validation: Check if the story belongs to the current user
          if (data.userId !== auth.currentUser?.uid) {
             setError('You do not have permission to view this story.');
             setStory(null);
             setIsLoading(false);
          } else {
            // Convert Timestamps if necessary (onSnapshot often does this automatically, but good practice)
             const processedData = {
               ...data,
               id: docSnap.id,
               createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
               updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
             };
            setStory(processedData);
            setError(null);
          }
        } else {
          setError('Story not found.');
          setStory(null);
        }
        setIsLoading(false);
      },
      (err) => {
        console.error("Error fetching story:", err);
        setError(`Failed to load story: ${err.message}`);
        setIsLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => unsubscribe();

  }, [storyId, firestore, auth, navigate]);

  // Audio playback handler
  function playAudio(audioUrl: string) {
    // Stop currently playing audio if any
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0; // Rewind
    }
    
    if (audioUrl) {
      const newAudio = new Audio(audioUrl);
      audioRef.current = newAudio;
      setCurrentAudio(newAudio);
      newAudio.play().catch(e => console.error("Error playing audio:", e));
      newAudio.onended = () => {
        setCurrentAudio(null);
        audioRef.current = null;
      };
    }
  }

  // Render logic
  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading story...</div>;
  }

  if (error) {
    return <div className="flex flex-col justify-center items-center h-screen text-red-600">
             <p>{error}</p>
             <button onClick={() => navigate('/home')} className="mt-4 px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400">Back to Home</button>
           </div>;
  }

  if (!story) {
    return <div className="flex justify-center items-center h-screen">Story data unavailable.</div>;
  }

  // Display Story Content
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <button 
        className="absolute top-4 left-4 px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400 text-sm z-10"
        onClick={() => navigate('/home')} // Or maybe navigate(-1)?
      >
        Back to Home
      </button>

      <h1 className="text-3xl font-bold text-center my-6">{story.title || 'Generating Title...'}</h1>
      
      <div className="text-center mb-6 p-3 bg-blue-100 rounded-lg shadow">
        <p className="font-semibold text-blue-800">Status:</p>
        <p className="text-lg text-blue-700 animate-pulse">{formatStatus(story.status)}</p>
        {story.status === 'error' && story.errorMessage && (
            <p className="text-sm text-red-600 mt-1">Error details: {story.errorMessage}</p>
        )}
      </div>

      {/* Display generated sections */}
      <div className="space-y-8">
        {/* Add Array.isArray check to prevent mapping non-arrays */}
        {Array.isArray(story.sections) ? story.sections.map((section, index) => (
          <div key={index} className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row gap-4 items-start">
            {/* Image Section */}
            <div className="w-full md:w-1/3 flex-shrink-0">
              {section.imageUrl ? (
                <img src={section.imageUrl} alt={`Illustration for section ${index + 1}`} className="w-full h-auto object-cover rounded aspect-square" />
              ) : (
                <div className="w-full bg-gray-200 rounded aspect-square flex items-center justify-center text-gray-500">
                  {story.status.startsWith(`generating_image_${index}`) || story.status.startsWith(`generating_audio_${index}`) || story.status === 'complete' || parseInt(story.status.split('_')[2] || '-1') > index ? 'Generating illustration...' : 'Waiting for illustration...'}
                </div>
              )}
            </div>

            {/* Text and Audio Section */}
            <div className="w-full md:w-2/3">
              <h3 className="text-lg font-semibold mb-2 text-gray-700">Section {index + 1} {section.planItem ? `- ${section.planItem}` : ''}</h3>
              {section.text ? (
                <p className="text-gray-800 mb-3">{section.text}</p>
              ) : (
                <p className="text-gray-500 italic mb-3">
                   {story.status.startsWith(`generating_text_${index}`) || story.status.startsWith(`generating_image_${index}`) || story.status.startsWith(`generating_audio_${index}`) || story.status === 'complete' || parseInt(story.status.split('_')[2] || '-1') > index ? 'Generating text...' : 'Waiting for text...'}
                </p>
              )}

              {/* Audio Player Button */}
              {section.audioUrl && (
                <button
                  onClick={() => playAudio(section.audioUrl!)}
                  disabled={!!currentAudio && currentAudio.src === section.audioUrl}
                  className={`px-3 py-1 rounded text-sm transition duration-150 ease-in-out ${
                    currentAudio && currentAudio.src === section.audioUrl
                      ? 'bg-pink-500 text-white cursor-default'
                      : 'bg-purple-500 text-white hover:bg-purple-600'
                  }`}
                >
                  {currentAudio && currentAudio.src === section.audioUrl ? 'Playing...' : 'Play Audio'}
                </button>
              )}
               {/* Placeholder/Loading for Audio */} 
               {!section.audioUrl && (story.status.startsWith(`generating_audio_${index}`) || story.status === 'complete' || (story.status.startsWith('generating_') && parseInt(story.status.split('_')[2] || '-1') > index)) && section.text && section.imageUrl && (
                 <span className="text-sm text-gray-500 italic">Generating audio...</span>
               )}
            </div>
          </div>
        )) : (
          <p className="text-center text-gray-500 italic">Waiting for story sections to load correctly...</p>
        )}
      </div>

      {/* Complete State */} 
      {story.status === 'complete' && (
          <div className="mt-8 text-center p-4 bg-green-100 rounded-lg shadow">
              <p className="text-xl font-semibold text-green-800">🎉 Your story is ready! 🎉</p>
          </div>
      )}
    </div>
  );
} 