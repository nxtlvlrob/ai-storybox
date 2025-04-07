export interface Character {
  id: string;          // Firestore document ID
  userId: string;      // Firebase Auth User ID
  name: string;        // Character's name
  description: string; // Detailed description (appearance, personality, etc.)
  createdAt: Date | string; // Timestamp of creation (Date object or ISO string)
  avatarUrl?: string;   // Optional: Permanent Firebase Storage URL for the avatar SVG
  // Optional: Add more fields later, like visual keywords for image gen
} 