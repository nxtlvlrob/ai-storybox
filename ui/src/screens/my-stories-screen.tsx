import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, query, where, orderBy, getDocs, Timestamp, doc, deleteDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Import types - adjust path if necessary
import type { StoryDocument } from '../../../types';

export function MyStoriesScreen() {
  const navigate = useNavigate();
  const auth = getAuth();
  const firestore = getFirestore();
  
  const [stories, setStories] = useState<StoryDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storyToDelete, setStoryToDelete] = useState<StoryDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuOpenForStory, setMenuOpenForStory] = useState<string | null>(null);

  // Fetch stories on component mount
  useEffect(() => {
    fetchStories();
  }, [auth, firestore]);

  // Fetch stories function - extracted to be reusable
  async function fetchStories() {
    if (!auth.currentUser) {
      setError('You must be logged in to view your stories');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const userId = auth.currentUser.uid;
      const storiesRef = collection(firestore, 'stories');
      const storiesQuery = query(
        storiesRef, 
        where('userId', '==', userId),
        orderBy('createdAt', 'desc') // Most recent first
      );
      
      const querySnapshot = await getDocs(storiesQuery);
      const fetchedStories: StoryDocument[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data() as Omit<StoryDocument, 'id'>;
        fetchedStories.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt instanceof Timestamp 
            ? data.createdAt.toDate() 
            : data.createdAt,
          updatedAt: data.updatedAt instanceof Timestamp 
            ? data.updatedAt.toDate() 
            : data.updatedAt,
        } as StoryDocument);
      });
      
      setStories(fetchedStories);
      setError(null);
    } catch (err) {
      console.error('Error fetching stories:', err);
      setError('Failed to load your stories. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }

  // Format date for display
  function formatDate(date: Date | undefined): string {
    if (!date) return 'Unknown date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  // Get the first available image from a story's sections
  function getStoryThumbnail(story: StoryDocument): string | null {
    if (Array.isArray(story.sections) && story.sections.length > 0) {
      // Try to find first section with an image
      const sectionWithImage = story.sections.find(section => section.imageUrl);
      if (sectionWithImage) {
        return sectionWithImage.imageUrl;
      }
    }
    return null;
  }

  // Handle story card click to view a story
  function handleStoryClick(storyId: string) {
    navigate(`/stories/${storyId}`);
  }

  // Handle create new story button click
  function handleCreateStory() {
    navigate('/create-story');
  }

  // Toggle story menu open/closed
  function toggleStoryMenu(event: React.MouseEvent, storyId: string) {
    event.stopPropagation(); // Prevent story click from triggering
    setMenuOpenForStory(prevId => prevId === storyId ? null : storyId);
  }

  // Open delete confirmation for a story
  function confirmDeleteStory(event: React.MouseEvent, story: StoryDocument) {
    event.stopPropagation(); // Prevent navigation
    setStoryToDelete(story);
    setMenuOpenForStory(null); // Close menu
  }

  // Cancel story deletion
  function cancelDelete() {
    setStoryToDelete(null);
  }

  // Delete story
  async function deleteStory() {
    if (!storyToDelete) return;
    
    try {
      setIsDeleting(true);
      await deleteDoc(doc(firestore, 'stories', storyToDelete.id));
      
      // Update local state to remove the deleted story
      setStories(prevStories => 
        prevStories.filter(s => s.id !== storyToDelete.id)
      );
      
      setStoryToDelete(null);
    } catch (err) {
      console.error('Error deleting story:', err);
      setError('Failed to delete story. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  // Close any open menus when clicking outside
  useEffect(() => {
    function handleClickOutside() {
      setMenuOpenForStory(null);
    }
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-100">
        <div className="w-20 h-20 rounded-full border-4 border-t-blue-600 border-r-blue-400 border-b-blue-400 border-l-transparent animate-spin mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700">Loading your stories...</h2>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-red-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <button 
            onClick={() => navigate(-1)}
            className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 transition text-sm font-medium"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-100 pb-12">
      {/* Header using flex-1 for centering - Transparent Background */}
      <header className="sticky top-0 px-4 py-3 flex justify-between items-center z-10 w-full">
        {/* Left Slot (Back Button) */}
        <div className="flex-1 text-left">
          <button 
            className="px-3 py-1.5 rounded-lg text-sm text-blue-700 hover:text-blue-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 inline-block"
            onClick={() => navigate('/home')}
          >
            Back
          </button>
        </div>

        {/* Center Slot (Title) */}
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-blue-900 inline-block">My Stories</h1>
        </div>

        {/* Right Slot (New Story Button) */}
        <div className="flex-1 text-right">
          <button 
            className="px-3 py-1.5 rounded-lg text-sm text-blue-700 hover:text-blue-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 inline-block"
            onClick={handleCreateStory}
          >
            + New Story
          </button>
        </div>
      </header>

      {/* Main content - Adjusted top padding if needed */}
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {stories.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 text-4xl flex items-center justify-center">
              📖
            </div>
            <h2 className="text-xl font-semibold text-blue-900 mb-2">No Stories Yet!</h2>
            <p className="text-gray-600 mb-6">Ready to create your first story?</p>
            <button
              onClick={handleCreateStory}
              className="px-5 py-2.5 sm:px-6 sm:py-3 bg-blue-600 text-white text-sm sm:text-base font-semibold rounded-lg shadow hover:bg-blue-700 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Create Your First Story
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {stories.map((story) => {
              const thumbnail = getStoryThumbnail(story);
              return (
                <div 
                  key={story.id}
                  onClick={() => handleStoryClick(story.id)}
                  className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:translate-y-[-2px] relative"
                >
                  <div className="aspect-[4/3] bg-gray-200 relative">
                    {thumbnail ? (
                      <img 
                        src={thumbnail} 
                        alt={story.title} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    {/* Status badge if story is not complete */}
                    {story.status !== 'complete' && (
                      <div className="absolute top-2 right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">
                        {story.status === 'error' ? 'Error' : 'In Progress'}
                      </div>
                    )}
                    
                    {/* Story options menu button */}
                    <button 
                      onClick={(e) => toggleStoryMenu(e, story.id)}
                      className="absolute top-2 left-2 bg-black/40 hover:bg-black/60 p-1.5 rounded-full text-white transition-all"
                      aria-label="Story options"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    
                    {/* Story options dropdown */}
                    {menuOpenForStory === story.id && (
                      <div className="absolute top-11 left-2 bg-white rounded-lg shadow-lg py-1 z-10 min-w-[150px]">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStoryClick(story.id);
                          }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                        >
                          View Story
                        </button>
                        <button 
                          onClick={(e) => confirmDeleteStory(e, story)}
                          className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none"
                        >
                          Delete Story
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 className="text-lg font-semibold text-purple-900 mb-1 line-clamp-1">{story.title}</h2>
                    <p className="text-sm text-gray-500">{formatDate(story.createdAt as Date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {storyToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Confirm Deletion</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete the story "<strong className="font-medium">{storyToDelete.title}</strong>"?
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm font-medium transition"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={deleteStory}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm font-medium transition disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Story'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 