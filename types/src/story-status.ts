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