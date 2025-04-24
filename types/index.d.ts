// Copied from ui/src/services/firestore-service.ts
import { Timestamp, FieldValue } from "firebase/firestore";

// Gemini Service Types
// export interface GeminiConfig { ... }
// export interface GenerateTextInput { ... }
// export interface GenerateImageInput { ... }
// export interface StoryPlan { ... }

export interface Character {
    id: string;          // Firestore document ID
    userId: string;      // Firebase Auth User ID
    name: string;        // Character's name
    description: string; // Detailed description (appearance, personality, etc.)
    createdAt: Date | string; // Timestamp of creation (Date object or ISO string)
    avatarUrl?: string;   // Optional: Permanent Firebase Storage URL for the avatar SVG
    // Optional: Add more fields later, like visual keywords for image gen
}

/**
 * Represents the structure of a story document stored in Firestore.
 */
export interface StoryDocument {
    id: string;                       // Firestore document ID
    userId: string;                   // ID of the user who created the story
    title: string;                   // Story title
    topic: string | null;             // User-provided topic
    originalPrompt: string | null;    // Full prompt if user provided one directly
    characterIds: string[];           // Array of character IDs selected
    length: StoryLength;              // Desired story length
    status: StoryStatus;              // Current generation state
    errorMessage?: string | null;      // Error message if status is 'error'
    sections: StorySection[];         // Array containing generated content for each section
    createdAt: Timestamp | FieldValue | Date;      // Firestore timestamp
    updatedAt: Timestamp | FieldValue | Date;     // Firestore timestamp
    ttsProvider?: /*"google" |*/ "elevenlabs" | "openai"; // REMOVED: google option
    gender?: "male" | "female";       // Gender for voice selection in TTS
    voiceId?: string;                 // Voice ID used for generation
}

/**
 * Represents a single generated section of a story.
 */
export interface StorySection {
    index: number;            // Section index (0-based)
    text: string | null;      // Generated text content
    imageBrief: string | null; // ADDED: Brief description for image generation
    imageUrl: string | null;  // Permanent Firebase Storage URL for the generated image
    audioUrl: string | null;  // Permanent Firebase Storage URL for the generated audio
}

/**
 * Represents the possible states of the story generation process.
 */
export type StoryStatus =
    | 'queued'          // Initial state, waiting for Cloud Function pickup
    | 'generating_story' // Generating the complete story text and image briefs
    | `generating_assets_${number}` // ADDED: Generating image and audio for section {number} concurrently
    | 'complete'        // All sections generated successfully
    | 'error';          // An error occurred during generation

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

/**
 * Represents the possible lengths for a generated story.
 */
export type StoryLength = 'short' | 'medium' | 'long';

// ADDED: Structure for topic suggestions
export interface TopicSuggestion {
  text: string;
  emojis: string; // String containing 1-2 emojis
}

export interface UserProfile {
    uid: string;
    name: string;
    birthday: Date | null;
    gender?: 'boy' | 'girl';
    avatarUrl?: string;
    avatarConfig?: {
        style: 'adventurer' | 'pixel-art';
        options: Record<string, string>;
    } | null;
    voiceId?: string;
    createdAt: Timestamp | FieldValue;
    onboardingComplete: boolean;
    // Add other fields as needed
} 