/**
 * Contains all prompts used for story generation with Gemini
 */

import { StoryLength } from "../../../types"; // Corrected import path for types

/**
 * Builds a prompt for generating a complete story (title, text, image briefs) 
 * using OpenAI, requesting JSON output.
 * @param characters Character description string.
 * @param topic The main topic/theme of the story.
 * @param length Desired story length ('short', 'medium', 'long').
 * @returns The prompt string for the OpenAI API.
 */
export function buildCompleteStoryPrompt(
  characters: string,
  topic: string,
  length: StoryLength
): string {
  const sectionEstimate = length === "short" ? 3 : length === "medium" ? 5 : 7;

  return `Please generate a complete children's story based on these details:

Characters: ${characters}
Topic: ${topic}
Desired Length: Approximately ${sectionEstimate} sections (guideline, adjust for narrative flow).
Target Audience: Children aged 5-8 years old.

Instructions:
1.  Create a captivating title for the story.
2.  Divide the story into logical sections (around ${sectionEstimate}).
3.  For each section:
    *   Write engaging narrative text (around 50-100 words per section).
    *   Use simple vocabulary and sentence structures suitable for reading aloud.
    *   Include dialogue where appropriate.
    *   Ensure smooth transitions between sections, forming a coherent plot with a beginning, middle, and end.
    *   Create a concise (1-2 sentences) **imageBrief** that visually describes the key moment or scene in that section. This brief should guide an image generation model (like DALL-E) effectively.

Output Format:
Return ONLY a single, valid JSON object adhering strictly to this structure:
{
  "title": "[Generated Story Title]",
  "sections": [
    {
      "text": "[Narrative text for section 1]",
      "imageBrief": "[Visual description/brief for section 1 image]"
    },
    {
      "text": "[Narrative text for section 2]",
      "imageBrief": "[Visual description/brief for section 2 image]"
    },
    // ... continue for all sections ...
  ]
}

Do not include any explanations, introductory text, or markdown formatting outside the JSON structure.`;
}

/**
 * Builds a prompt for generating an image for a story section.
 * UPDATED: Takes imageBrief directly.
 */
export function buildImagePrompt(
  characters: string,
  imageBrief: string // Changed from planItem and sectionText
): string {
  // This prompt is now simpler, relying on the pre-generated imageBrief.
  // Character description is still included for potential consistency checks by the model.
  return `Generate an illustration for a children's storybook based on this description:

Characters: ${characters}
Scene Brief: ${imageBrief}

Style Guidelines:
- Render in a flat, vector-based cartoon style with bold, dark outlines.
- Use simple, stylized character features.
- Use solid, matte colors. Avoid gradients or complex shading.
- Create a bright, cheerful, and simple look suitable for young children (ages 5-8).
- Maintain a widescreen 16:9 aspect ratio.
- Focus on the scene described in the brief.

**CRITICAL Constraints:**
- **Originality:** Create *original* character designs and scenes based *only* on the provided descriptions. Avoid any resemblance to known copyrighted characters, brands, or specific art styles (e.g., Disney, Peppa Pig).
- **Single Character Instance:** If the main character is mentioned, show ONLY ONE instance of them.
- **No Text:** The image must NOT contain any letters, words, or numbers.
- **Single Frame:** Output a single, unified image. Do NOT use multiple panels or comic layouts.

Respond ONLY with the image data. Strictly adhere to all constraints.`;
}

/**
 * Builds a prompt for generating story topic suggestions using OpenAI.
 * (Updated for clearer JSON instructions)
 */
export function buildTopicSuggestionsPrompt(
  age: number,
  gender: string
): string {
  return `Suggest 9 creative and fun story topic ideas suitable for a ${age}-year-old ${gender}.
Each suggestion should be a short phrase (1-6 words).
For each suggestion, provide the text and a string with 1-2 relevant emojis.

Output Format:
Return ONLY a single, valid JSON object adhering strictly to this structure:
{
  "topics": [
    {"text": "[Topic idea 1]", "emojis": "[Emojis 1]"},
    {"text": "[Topic idea 2]", "emojis": "[Emojis 2]"},
    // ... up to 9 topic suggestions ...
  ]
}

Example Topic Object: {"text": "A talking squirrel's big secret", "emojis": "🐿️🤫"}
Do not include any explanations or text outside the JSON structure.`;
} 