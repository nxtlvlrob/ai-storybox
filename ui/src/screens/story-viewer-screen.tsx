import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Assuming types are defined in a shared types file
import type { StoryDocument, StoryStatus } from '../../../types';

// Helper to format status messages
function formatStatus(status: StoryStatus): string {
  if (status === 'queued') return 'Ready to start...';
  if (status === 'planning') return 'Thinking up the story...';
  if (status === 'complete') return 'Story Complete!';
  if (status === 'error') return 'Oh no, an error occurred!';
  if (status.startsWith('generating_text_')) {
    const index = status.split('_')[2];
    return `Writing part ${parseInt(index, 10) + 1}...`;
  }
  if (status.startsWith('generating_image_')) {
    const index = status.split('_')[2];
    return `Making picture for part ${parseInt(index, 10) + 1}...`;
  }
  if (status.startsWith('generating_audio_')) {
    const index = status.split('_')[2];
    return `Recording sound for part ${parseInt(index, 10) + 1}...`;
  }
  return 'Working on it...'; // Fallback
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
  const [showPlaybackIndicator, setShowPlaybackIndicator] = useState<'play' | 'pause' | null>(null);
  const playbackIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Refs for audio control and tracking
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentPlayingSection = useRef<string | null>(null);
  const loadedSections = useRef<Set<string>>(new Set());
  
  // Track Firestore updates to prevent audio restarts
  const lastStoryUpdate = useRef<number>(Date.now());

  // --- Playback Indicator Logic ---
  const triggerPlaybackIndicator = useCallback((type: 'play' | 'pause') => {
    if (playbackIndicatorTimeoutRef.current) {
      clearTimeout(playbackIndicatorTimeoutRef.current);
    }
    setShowPlaybackIndicator(type);
    playbackIndicatorTimeoutRef.current = setTimeout(() => {
      setShowPlaybackIndicator(null);
    }, 1000); // Show indicator for 1 second
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (playbackIndicatorTimeoutRef.current) {
        clearTimeout(playbackIndicatorTimeoutRef.current);
      }
    };
  }, []);

  // Moved playAudio definition up
  const playAudio = useCallback((audioUrl: string, sectionId: string) => {
    if (currentPlayingSection.current === sectionId && audioRef.current) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (audioUrl) {
      const newAudio = new Audio(audioUrl);
      audioRef.current = newAudio;
      currentPlayingSection.current = sectionId;
      setCurrentAudio(newAudio);
      newAudio.addEventListener('play', () => {
        loadedSections.current.add(sectionId);
        triggerPlaybackIndicator('play');
      });
      newAudio.play().catch(e => {
        console.error("Error playing audio:", e);
        currentPlayingSection.current = null;
      });
      newAudio.onended = () => {
        setCurrentAudio(null);
        audioRef.current = null;
        currentPlayingSection.current = null;
        if (story && Array.isArray(story.sections) && currentSectionIndex < story.sections.length - 1 && isAutoPlaying) {
          setCurrentSectionIndex(prev => prev + 1);
        }
      };
    }
  }, [story, currentSectionIndex, isAutoPlaying, triggerPlaybackIndicator]);

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

  // Auto-play useEffect - now defined after playAudio
  useEffect(() => {
    if (!story || !Array.isArray(story.sections) || currentSectionIndex >= story.sections.length || !isAutoPlaying) return;
    const section = story.sections[currentSectionIndex];
    if (!section || !section.audioUrl) return;
    const currentSectionId = `${storyId}_${currentSectionIndex}`;
    if (currentSectionId !== currentPlayingSection.current) {
      playAudio(section.audioUrl, currentSectionId);
    }
  }, [story, currentSectionIndex, isAutoPlaying, storyId, playAudio]);

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
    navigate('/create-story');
  };

  // Toggle text visibility
  const toggleTextOverlay = () => {
    setIsTextVisible(prev => !prev);
  };

  // Render logic
  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-100">
        <div className="w-24 h-24 relative">
          <div className="absolute w-full h-full rounded-full border-4 border-t-blue-500 border-r-blue-300 border-b-blue-300 border-l-transparent animate-spin"></div>
          <div className="absolute w-full h-full flex items-center justify-center">
            <span className="text-3xl">📖</span>
          </div>
        </div>
        <p className="mt-4 text-gray-700 font-medium animate-pulse">Loading your story...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-red-100 p-4">
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-md text-center">
          <p className="text-red-600 mb-4 font-medium">{error}</p>
          <button 
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white rounded-lg shadow hover:bg-gray-600 transition duration-150 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex justify-center items-center h-screen bg-blue-100">
        <p className="text-lg font-medium text-blue-800">Story data unavailable.</p>
      </div>
    );
  }

  // Check if story is still initializing
  const isInitializing = !hasStartedPlayback && Array.isArray(story.sections) && story.sections.length > 0 &&
    story.sections.every(section => !section.text || !section.imageUrl || !section.audioUrl);

  // Display loading screen while story is initializing
  if (isInitializing) {
    return (
      <div className="fixed inset-0 flex flex-col justify-center items-center bg-gray-100">
        <div className="relative w-64 h-64 mb-6">
          <div className="absolute top-0 left-0 w-full h-full">
            <div className="w-full h-full bg-white rounded-lg shadow-lg overflow-hidden relative transform transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-blue-200 animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-white rounded-full border-t-transparent animate-spin"></div>
              </div>
            </div>
          </div>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4 text-blue-800">{story.title || 'Getting Your Story Ready...'}</h1>
        <p className="text-lg text-center text-blue-700 animate-pulse">{formatStatus(story.status)}</p>
        <div className="mt-6 w-64 h-4 bg-gray-300 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 animate-progress"></div>
        </div>
      </div>
    );
  }

  // Find the current section
  const currentSection = Array.isArray(story.sections) && story.sections.length > currentSectionIndex 
    ? story.sections[currentSectionIndex] 
    : null;

  // Early check for empty story sections array
  const isEmptySections = Array.isArray(story.sections) && story.sections.length === 0;

  // Story player - now with fullscreen section view and swipe navigation
  return (
    <div 
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden bg-gray-100 select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Exit Button */} 
      <button 
        onClick={() => navigate('/my-stories')} 
        className="absolute top-4 right-4 z-40 p-2 bg-black/40 rounded-full text-white hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800"
        aria-label="Close Story"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Story Player View */}
      {currentSection ? (
        <div className={`h-full ${isSwiping ? 'transition-none' : 'transition-transform duration-300'}`}>
          {/* Image Section - Updated background */}
          <div className="relative h-full bg-white">
            {currentSection.imageUrl ? (
              <img 
                src={currentSection.imageUrl} 
                alt={`Illustration for section ${currentSectionIndex + 1}`} 
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => {
                  if (currentSection.audioUrl) {
                    if (currentAudio) {
                      audioRef.current?.pause();
                      setCurrentAudio(null);
                      audioRef.current = null;
                      setIsAutoPlaying(false);
                      triggerPlaybackIndicator('pause'); // Trigger pause indicator
                    } else {
                      playAudio(currentSection.audioUrl, `${storyId}_${currentSectionIndex}`);
                      setIsAutoPlaying(true);
                      // Play indicator triggered within playAudio
                    }
                  }
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="bg-white/50 backdrop-blur-sm rounded-lg p-6 shadow-lg">
                  <div className="w-16 h-16 mx-auto border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-center text-blue-700">{story.status.startsWith(`generating_image_${currentSectionIndex}`) ? 'Drawing picture...' : 'Loading picture...'}</p>
                </div>
              </div>
            )}
            
            {/* Section indicators - Updated colors */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-2">
              {Array.isArray(story.sections) && story.sections.map((_, index) => (
                <button 
                  key={index}
                  className={`w-3 h-3 rounded-full transition-all ${index === currentSectionIndex ? 'bg-blue-600 w-6' : 'bg-gray-300 hover:bg-gray-400'}`}
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

            {/* Loading spinner when audio not ready */}
            {!currentSection.audioUrl && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/80 p-6 rounded-full shadow-xl">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
            )}
            
            {/* Navigation Controls - Updated styles */}
            <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 flex justify-between px-4 pointer-events-none">
              <button
                onClick={goToPrevSection}
                disabled={currentSectionIndex === 0}
                className={`p-3 rounded-full pointer-events-auto focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${currentSectionIndex === 0 ? 'text-gray-300 bg-white/50 cursor-not-allowed' : 'text-blue-700 bg-white/80 hover:bg-white shadow-md'}`}
                aria-label="Previous Section"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <button
                onClick={goToNextSection}
                disabled={!story.sections || currentSectionIndex === story.sections.length - 1}
                className={`p-3 rounded-full pointer-events-auto focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${!story.sections || currentSectionIndex === story.sections.length - 1 ? 'text-gray-300 bg-white/50 cursor-not-allowed' : 'text-blue-700 bg-white/80 hover:bg-white shadow-md'}`}
                aria-label="Next Section"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-4">
          {/* Show proper loading/empty state for different conditions - Updated styles */}
          {story.status && story.status !== 'complete' ? (
            <div className="text-center p-6 bg-white rounded-xl shadow-lg max-w-sm">
              <div className="w-16 h-16 mx-auto border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
              <p className="text-lg text-blue-700 font-medium">{formatStatus(story.status)}</p>
              <p className="text-sm text-blue-500 mt-2">Please wait while the story finishes...</p>
            </div>
          ) : isEmptySections ? (
            <div className="text-center p-6 bg-white rounded-xl shadow-lg max-w-sm">
              <p className="text-lg text-gray-600 mb-4">This story doesn\'t have any pages yet!</p>
              <button
                onClick={() => navigate('/my-stories')}
                className="mt-4 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Back to My Stories
              </button>
            </div>
          ) : (
            <p className="text-lg text-gray-600">No sections available</p>
          )}
        </div>
      )}

      {/* Play/Pause Indicator Overlay */}
      <div className={`absolute inset-0 flex items-center justify-center z-20 pointer-events-none transition-opacity duration-300 ${showPlaybackIndicator ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-black/50 p-6 rounded-full">
          {showPlaybackIndicator === 'play' && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8.118v3.764a1 1 0 001.555.832l3.197-1.882a1 1 0 000-1.664l-3.197-1.882z" clipRule="evenodd" />
            </svg>
          )}
          {showPlaybackIndicator === 'pause' && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h1a1 1 0 100-2H8V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 001 1h1a1 1 0 100-2h-1V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
        </div>
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
            <h3 className="text-lg font-medium text-blue-800 mb-2">
              {currentSection.planItem || `Section ${currentSectionIndex + 1}`}
            </h3>
            <p className="text-base sm:text-lg text-gray-700 leading-relaxed mb-6">
              {currentSection.text}
            </p>
            <button
              onClick={toggleTextOverlay}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-400"
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
              <h2 className="text-2xl sm:text-3xl font-bold text-blue-800 mb-2">The End!</h2>
              <p className="text-gray-600">You finished reading "{story.title}"!</p>
            </div>
            
            <div className="space-y-4">
              <button
                onClick={restartStory}
                className="w-full px-5 py-2.5 sm:px-6 sm:py-3 bg-blue-600 text-white text-sm sm:text-base font-semibold rounded-lg shadow-md hover:bg-blue-700 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Read Again
              </button>
              <button
                onClick={createNewStory}
                className="w-full px-5 py-2.5 sm:px-6 sm:py-3 bg-gray-500 text-white rounded-lg shadow-md hover:bg-gray-600 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Start a New Story
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}