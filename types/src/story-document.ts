import { Timestamp } from 'firebase/firestore'; // Or import from 'firebase-admin/firestore' on server

/**
 * Represents the structure of a story document stored in Firestore.
 */
export interface StoryDocument {
    id: string;                       // Firestore document ID (usually added client-side after getting ref)
    userId: string;                   // ID of the user who created the story
    title: string;                   // Story title
    topic: string | null;             // User-provided topic 
    originalPrompt: string | null;    // Full prompt if user provided one directly
    characterIds: string[];           // Array of character IDs selected
    length: StoryLength;              // Desired story length 
    status: StoryStatus;              // Current generation state
    errorMessage: string | null;      // Error message if status is 'error'
    plan: string[];                   // Generated story plan (array of scene descriptions)
    sections: StorySection[];         // Array containing generated content for each section
    createdAt: Timestamp | Date;      // Firestore timestamp when the job was created (Date on client)
    updatedAt?: Timestamp | Date;     // Firestore timestamp, updated by the Cloud Function (Date on client)
} 

/**
 * Represents a single generated section of a story.
 */
export interface StorySection {
    index: number;            // Section index (0-based)
    planItem: string;         // The description from the generated plan for this section
    text: string | null;      // Generated text content
    imageUrl: string | null;  // Permanent Firebase Storage URL for the generated image
    audioUrl: string | null;  // Permanent Firebase Storage URL for the generated audio
} 

/**
 * Represents the possible lengths for a generated story.
 */
export type StoryLength = 'short' | 'medium' | 'long'; 

/**
 * Represents the possible states of the story generation process.
 */
export type StoryStatus = 
    | 'queued'          // Initial state, waiting for Cloud Function pickup
    | 'planning'        // Story plan is being generated
    | `generating_text_${number}` // Generating text for section {number}
    | `generating_image_${number}`// Generating image for section {number}
    | `generating_audio_${number}`// Generating audio for section {number}
    | 'complete'        // All sections generated successfully
    | 'error';          // An error occurred during generation 