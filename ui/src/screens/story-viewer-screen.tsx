import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Assuming types are defined in a shared types file
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
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [hasStartedPlayback, setHasStartedPlayback] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(true);
  const [isTextVisible, setIsTextVisible] = useState<boolean>(false);
  
  // Refs for audio control and tracking
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentPlayingSection = useRef<string | null>(null);
  const loadedSections = useRef<Set<string>>(new Set());
  
  // Track Firestore updates to prevent audio restarts
  const lastStoryUpdate = useRef<number>(Date.now());

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
            // Record the time of this update
            lastStoryUpdate.current = Date.now();
            
            // Convert Timestamps
            const processedData = {
              ...data,
              id: docSnap.id,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
              updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
            };
            
            // Track which sections have content for playback stability
            if (Array.isArray(processedData.sections)) {
              processedData.sections.forEach((section, idx) => {
                if (section.audioUrl) {
                  loadedSections.current.add(`${storyId}_${idx}`);
                }
              });
            }
            
            setStory(processedData);
            setError(null);
            
            // Auto start playback if we have at least one section with all content ready
            if (!hasStartedPlayback && Array.isArray(data.sections) && data.sections.length > 0) {
              const firstReadySection = data.sections.findIndex(
                section => section.text && section.imageUrl && section.audioUrl
              );
              
              if (firstReadySection !== -1) {
                setCurrentSectionIndex(firstReadySection);
                setHasStartedPlayback(true);
              }
            }
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
    return () => {
      unsubscribe();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [storyId, firestore, auth, navigate, hasStartedPlayback]);

  // Auto-play the section once it's ready - with Firestore update protection
  useEffect(() => {
    if (!story || !Array.isArray(story.sections) || 
        currentSectionIndex >= story.sections.length || 
        !isAutoPlaying) {
      return;
    }
    
    const section = story.sections[currentSectionIndex];
    if (!section || !section.audioUrl) {
      return;
    }
    
    const currentSectionId = `${storyId}_${currentSectionIndex}`;
    
    // If this is a new section that we haven't started playing yet, or 
    // if no section is currently playing, start playback
    if (currentSectionId !== currentPlayingSection.current) {
      playAudio(section.audioUrl, currentSectionId);
    }
    // Otherwise, if this is the same section already playing, don't restart
    
  }, [story, currentSectionIndex, isAutoPlaying, storyId]);

  // Function to play audio with auto-advance to next section
  const playAudio = useCallback((audioUrl: string, sectionId: string) => {
    // Don't restart the same audio if it's already playing
    if (currentPlayingSection.current === sectionId && audioRef.current) {
      return;
    }
    
    // Stop currently playing audio if any
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    if (audioUrl) {
      const newAudio = new Audio(audioUrl);
      audioRef.current = newAudio;
      currentPlayingSection.current = sectionId;
      setCurrentAudio(newAudio);
      
      // Set up playback tracking
      newAudio.addEventListener('play', () => {
        // Mark this section as loaded for future reference
        loadedSections.current.add(sectionId);
      });
      
      newAudio.play().catch(e => {
        console.error("Error playing audio:", e);
        currentPlayingSection.current = null;
      });
      
      // Set up auto-advance when audio ends
      newAudio.onended = () => {
        setCurrentAudio(null);
        audioRef.current = null;
        currentPlayingSection.current = null;
        
        // Advance to next section if available and auto-play is on
        if (story && 
            Array.isArray(story.sections) && 
            currentSectionIndex < story.sections.length - 1 && 
            isAutoPlaying) {
          setCurrentSectionIndex(prev => prev + 1);
        }
      };
    }
  }, [story, currentSectionIndex, isAutoPlaying]);

  // Navigate to previous section if available
  const goToPrevSection = useCallback(() => {
    if (currentSectionIndex > 0) {
      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause();
        setCurrentAudio(null);
        audioRef.current = null;
        currentPlayingSection.current = null;
      }
      setCurrentSectionIndex(prev => prev - 1);
    }
  }, [currentSectionIndex]);

  // Navigate to next section if available
  const goToNextSection = useCallback(() => {
    if (story && Array.isArray(story.sections) && currentSectionIndex < story.sections.length - 1) {
      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause();
        setCurrentAudio(null);
        audioRef.current = null;
        currentPlayingSection.current = null;
      }
      setCurrentSectionIndex(prev => prev + 1);
    }
  }, [story, currentSectionIndex]);

  // Touch event handlers for swipe functionality
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart || !containerRef.current) return;
    
    const touchEnd = e.touches[0].clientX;
    const diff = touchStart - touchEnd;
    
    // Apply transform during swipe for visual feedback
    if (Math.abs(diff) > 5) { // Small threshold to prevent minor movements
      containerRef.current.style.transform = `translateX(${-diff * 0.5}px)`;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart || !containerRef.current) {
      setIsSwiping(false);
      return;
    }
    
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    
    // Reset transform
    containerRef.current.style.transform = 'translateX(0)';
    
    // Threshold for swipe detection (80px)
    if (Math.abs(diff) > 80) {
      if (diff > 0) {
        // Swipe left -> next section
        goToNextSection();
      } else {
        // Swipe right -> previous section
        goToPrevSection();
      }
    }
    
    setIsSwiping(false);
    setTouchStart(null);
  };

  // Start the story from the beginning
  const restartStory = () => {
    setCurrentSectionIndex(0);
    setIsAutoPlaying(true);
    currentPlayingSection.current = null;
    
    if (story && Array.isArray(story.sections) && story.sections[0]?.audioUrl) {
      const firstSectionId = `${storyId}_0`;
      setTimeout(() => playAudio(story.sections[0].audioUrl!, firstSectionId), 300);
    }
  };

  // Navigate to create new story
  const createNewStory = () => {
    navigate('/create');
  };

  // Toggle text visibility
  const toggleTextOverlay = () => {
    setIsTextVisible(prev => !prev);
  };

  // Render logic
  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gradient-to-b from-purple-50 to-blue-50">
        <div className="w-24 h-24 relative">
          <div className="absolute w-full h-full rounded-full border-4 border-t-purple-500 border-r-blue-500 border-b-pink-500 border-l-indigo-500 animate-spin"></div>
          <div className="absolute w-full h-full flex items-center justify-center">
            <span className="text-3xl">📚</span>
          </div>
        </div>
        <p className="mt-4 text-purple-800 font-medium animate-pulse">Loading your magical story...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gradient-to-b from-red-50 to-pink-50">
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => navigate('/home')} 
            className="w-full py-2 bg-purple-600 text-white rounded-lg shadow hover:bg-purple-700 transition duration-150"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex justify-center items-center h-screen bg-gradient-to-b from-blue-50 to-purple-50">
        <p className="text-lg font-medium text-purple-800">Story data unavailable.</p>
      </div>
    );
  }

  // Check if story is still initializing
  const isInitializing = !hasStartedPlayback && Array.isArray(story.sections) && story.sections.length > 0 &&
    story.sections.every(section => !section.text || !section.imageUrl || !section.audioUrl);

  // Display loading screen while story is initializing
  if (isInitializing) {
    return (
      <div className="fixed inset-0 flex flex-col justify-center items-center bg-gradient-to-b from-purple-100 to-indigo-100">
        <div className="relative w-64 h-64 mb-6">
          <div className="absolute top-0 left-0 w-full h-full">
            <div className="w-full h-full bg-white rounded-lg shadow-lg overflow-hidden relative transform transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-300 to-indigo-300 animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-white rounded-full border-t-transparent animate-spin"></div>
              </div>
            </div>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-4 text-purple-800">{story.title || 'Creating Your Story...'}</h1>
        <p className="text-lg text-center text-indigo-700 animate-pulse">{formatStatus(story.status)}</p>
        <div className="mt-6 w-64 h-4 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 animate-progress"></div>
        </div>
      </div>
    );
  }

  // Find the current section
  const currentSection = Array.isArray(story.sections) && story.sections.length > currentSectionIndex 
    ? story.sections[currentSectionIndex] 
    : null;

  // Story player - now with fullscreen section view and swipe navigation
  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-indigo-50 to-purple-50 overflow-hidden">
      {/* Top navigation */}
      <div className="py-3 px-4 flex justify-between items-center z-10 bg-white/80 backdrop-blur-sm shadow-sm">
        <button 
          className="px-3 py-1 bg-gray-100 rounded-full shadow-sm hover:bg-gray-200 text-sm transition"
          onClick={() => navigate('/home')}
        >
          ← Home
        </button>
        <h1 className="text-xl font-bold text-purple-900">{story.title}</h1>
        <button
          onClick={toggleTextOverlay}
          className="p-2 bg-gray-100 rounded-full shadow-sm hover:bg-gray-200 text-sm transition"
          aria-label="Show/hide text"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
      </div>
      
      {/* Main content area - Full height image */}
      <div 
        className="flex-1 overflow-hidden relative"
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Story Player View */}
        {currentSection ? (
          <div className={`h-full ${isSwiping ? 'transition-none' : 'transition-transform duration-300'}`}>
            {/* Image Section - Now Takes Full Height */}
            <div className="relative h-full bg-gradient-to-b from-indigo-50 to-purple-50">
              {currentSection.imageUrl ? (
                <img 
                  src={currentSection.imageUrl} 
                  alt={`Illustration for section ${currentSectionIndex + 1}`} 
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="bg-white/50 backdrop-blur-sm rounded-lg p-6 shadow-lg">
                    <div className="w-16 h-16 mx-auto border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-center text-indigo-600">
                      {story.status.startsWith(`generating_image_${currentSectionIndex}`) ? 
                        'Creating illustration...' : 'Loading illustration...'}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Section indicators */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-2">
                {Array.isArray(story.sections) && story.sections.map((_, index) => (
                  <button 
                    key={index}
                    className={`w-3 h-3 rounded-full transition-all ${index === currentSectionIndex ? 'bg-indigo-600 w-6' : 'bg-gray-300'}`}
                    onClick={() => {
                      setCurrentSectionIndex(index);
                      if (audioRef.current) {
                        audioRef.current.pause();
                        setCurrentAudio(null);
                        audioRef.current = null;
                      }
                    }}
                  />
                ))}
              </div>
              
              {/* Play button overlay on image */}
              {currentSection.audioUrl && !currentAudio && (
                <button
                  onClick={() => {
                    playAudio(currentSection.audioUrl!, `${storyId}_${currentSectionIndex}`);
                    setIsAutoPlaying(true);
                  }}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/80 hover:bg-white/90 text-indigo-600 p-6 rounded-full shadow-xl transition-all hover:scale-110 focus:outline-none focus:ring-4 focus:ring-indigo-300"
                  aria-label="Play audio"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
              
              {/* Pause button overlay when playing */}
              {currentAudio && (
                <button
                  onClick={() => {
                    audioRef.current?.pause();
                    setCurrentAudio(null);
                    audioRef.current = null;
                    setIsAutoPlaying(false);
                  }}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/80 hover:bg-white/90 text-indigo-600 p-6 rounded-full shadow-xl transition-all hover:scale-110 focus:outline-none focus:ring-4 focus:ring-indigo-300"
                  aria-label="Pause audio"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
              
              {/* Loading spinner when audio not ready */}
              {!currentSection.audioUrl && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/80 p-6 rounded-full shadow-xl">
                  <div className="w-10 h-10 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
              )}
              
              {/* Navigation Controls - Now positioned as overlays */}
              <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 flex justify-between px-4 pointer-events-none">
                <button
                  onClick={goToPrevSection}
                  disabled={currentSectionIndex === 0}
                  className={`p-3 rounded-full pointer-events-auto ${currentSectionIndex === 0 ? 'text-gray-300 bg-white/30' : 'text-purple-600 bg-white/60 hover:bg-white/80'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <button
                  onClick={goToNextSection}
                  disabled={!story.sections || currentSectionIndex === story.sections.length - 1}
                  className={`p-3 rounded-full pointer-events-auto ${!story.sections || currentSectionIndex === story.sections.length - 1 ? 'text-gray-300 bg-white/30' : 'text-purple-600 bg-white/60 hover:bg-white/80'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-lg text-gray-600">No sections available</p>
          </div>
        )}
      </div>
      
      {/* Text Overlay - Only visible when toggled */}
      {isTextVisible && currentSection && currentSection.text && (
        <div 
          className="fixed inset-0 bg-black/70 z-30 flex items-center justify-center p-4"
          onClick={toggleTextOverlay}
        >
          <div 
            className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-purple-700 mb-2">
              {currentSection.planItem || `Section ${currentSectionIndex + 1}`}
            </h3>
            <p className="text-xl text-gray-800 leading-relaxed mb-6">
              {currentSection.text}
            </p>
            <button
              onClick={toggleTextOverlay}
              className="w-full py-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* End of Story Modal - Only show when at last section and story is complete */}
      {story.status === 'complete' && 
       Array.isArray(story.sections) && 
       currentSectionIndex === story.sections.length - 1 && 
       !currentAudio && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-20">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl transform animate-pop-in">
            <div className="text-center mb-6">
              <span className="text-5xl mb-4 block">🎉</span>
              <h2 className="text-2xl font-bold text-purple-900 mb-2">Story Complete!</h2>
              <p className="text-gray-600">You've finished "{story.title}"</p>
            </div>
            
            <div className="space-y-4">
              <button
                onClick={restartStory}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-md hover:from-purple-700 hover:to-indigo-700 transition transform hover:scale-105"
              >
                Play Again
              </button>
              
              <button
                onClick={createNewStory}
                className="w-full py-3 bg-white border-2 border-purple-600 text-purple-600 rounded-xl shadow-sm hover:bg-purple-50 transition"
              >
                Create New Story
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 