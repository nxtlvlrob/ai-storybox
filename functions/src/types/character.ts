import { Timestamp } from "firebase-admin/firestore"; // Use admin timestamp type

/**
 * Represents the structure of a Character document stored in Firestore.
 * Copied from src/types/character.ts for Cloud Function use.
 */
export interface Character {
  id: string;          // Firestore document ID
  userId: string;      // Firebase Auth User ID
  name: string;        // Character's name
  description: string; // Detailed description (appearance, personality, etc.)
  createdAt: Timestamp; // Use Firestore Admin Timestamp for server-side
  avatarUrl?: string;   // Optional: Permanent Firebase Storage URL for the avatar SVG
} 