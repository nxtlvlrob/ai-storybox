/**
 * Represents a single generated section of a story.
 * Copied from src/types/story-section.ts for Cloud Function use.
 */
export interface StorySection {
    index: number;            // Section index (0-based)
    planItem: string;         // The description from the generated plan for this section
    text: string | null;      // Generated text content
    imageUrl: string | null;  // Permanent Firebase Storage URL for the generated image
    audioUrl: string | null;  // Permanent Firebase Storage URL for the generated audio
} 