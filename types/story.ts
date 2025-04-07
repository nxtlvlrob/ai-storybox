import { Timestamp } from 'firebase/firestore';
import { Character } from './character';
import { StoryLength } from './story-document';

// Interface for a single section within a story
export interface StorySectionData {
  planItem: string;       // The description from the plan
  text: string;           // The generated text for this section
  imageUrl?: string;      // URL of the generated image (temporary DALL-E URL for now)
  audioUrl?: string;      // Added: Persistent URL for stored audio
  // Client-side only state:
  audioBlobUrl?: string; // Temporary Blob URL for playback
}

// Base data structure for a story (used in frontend state and Firestore prep)
export interface StoryDocumentData {
  originalPrompt: string;
  characters: string;     // Added
  topic: string;          // Added
  length: StoryLength;    // Added (using imported type)
  plan: string[];
  sections: StorySectionData[]; // Should contain data without audioBlobUrl when saving
  title?: string;
  status?: string; // Added: Generation status (e.g., 'planning', 'complete', 'error')
}

// Full Firestore document structure including metadata
export interface StoryDocument extends Omit<StoryDocumentData, 'sections'> {
    userId: string;
    createdAt: Timestamp;
    sections: Omit<StorySectionData, 'audioBlobUrl'>[]; // Ensure Blob URL is not in Firestore type
    // id is implicitly available on Firestore documents
}

// Type for the loading state machine
export type LoadingState = 
    | 'idle' 
    | 'planning' 
    | 'generating_section' 
    | 'generating_image' 
    | 'generating_audio' 
    | 'saving' 
    | 'finished'
    | 'error'; 

// Combined Story Document Type (matching Firestore structure)
export interface Story {
    id: string; // Firestore document ID
    userId: string;
    title?: string; // Optional title
    topic: string;
    prompt: string;
    length: StoryLength;
    characters: string; // Simplified for now, could be array of Character IDs/objects
    plan?: string[]; // Array of planned section descriptions
    sections?: StorySectionData[]; // Array of generated sections
    status: 'queued' | 'planning' | 'generating' | 'complete' | 'error';
    errorMessage?: string;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
} 