import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
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

  // Fetch stories on component mount
  useEffect(() => {
    async function fetchStories() {
      if (!auth.currentUser) {
        setError('You must be logged in to view your stories');
        setIsLoading(false);
        return;
      }

      try {
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

    fetchStories();
  }, [auth, firestore]);

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
    navigate(`/story/${storyId}`);
  }

  // Handle create new story button click
  function handleCreateStory() {
    navigate('/create-story');
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-50 to-indigo-50">
        <div className="w-20 h-20 rounded-full border-4 border-t-purple-600 border-r-indigo-600 border-b-blue-600 border-l-transparent animate-spin mb-4"></div>
        <h2 className="text-xl font-semibold text-purple-800">Loading your stories...</h2>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-red-50 to-pink-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <button 
            onClick={() => navigate('/home')}
            className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-purple-50 pb-12">
      {/* Header with navigation */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-sm shadow-sm px-4 py-3 flex justify-between items-center z-10">
        <button 
          className="px-3 py-1 bg-gray-100 rounded-full shadow-sm hover:bg-gray-200 text-sm transition"
          onClick={() => navigate('/home')}
        >
          ← Home
        </button>
        <h1 className="text-xl font-bold text-purple-900">My Stories</h1>
        <button 
          className="px-3 py-1 bg-purple-100 rounded-full shadow-sm hover:bg-purple-200 text-sm text-purple-800 transition"
          onClick={handleCreateStory}
        >
          + New Story
        </button>
      </header>

      {/* Main content - Two column story grid */}
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {stories.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 text-4xl flex items-center justify-center">
              📚
            </div>
            <h2 className="text-xl font-semibold text-purple-900 mb-2">No Stories Yet</h2>
            <p className="text-gray-600 mb-6">Start creating your first magical story!</p>
            <button
              onClick={handleCreateStory}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow hover:shadow-lg transition transform hover:scale-105"
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
                  className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:translate-y-[-2px]"
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
    </div>
  );
} 