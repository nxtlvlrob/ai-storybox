import { Timestamp } from 'firebase-admin/firestore'; // Use admin timestamp
import { StoryLength } from './story-length';
import { StorySection } from './story-section';
import { StoryStatus } from './story-status';

/**
 * Represents the structure of a story document stored in Firestore.
 * Copied from src/types/story-document.ts for Cloud Function use.
 */
export interface StoryDocument {
    // Note: 'id' is typically not stored *within* the Firestore document itself
    userId: string;                   
    topic: string | null;             
    originalPrompt: string | null;    
    characterIds: string[];           
    length: StoryLength;              
    status: StoryStatus;              
    errorMessage: string | null;      
    plan: string[];                   
    sections: StorySection[];         
    createdAt: Timestamp;             // Use Firestore Admin Timestamp 
    updatedAt?: Timestamp;            // Use Firestore Admin Timestamp
} 