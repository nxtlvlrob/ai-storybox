/**
 * Contains all prompts used for story generation with Gemini
 */

/**
 * Builds a prompt for generating a story title based on characters and topic
 */
export function buildTitlePrompt(characters: string, topic: string): string {
  return `Generate a captivating, kid-friendly title for a children's story with these details:
Characters: ${characters}
Topic: ${topic}

Create a title that's engaging, concise (5-8 words), and captures the imagination.
Respond with ONLY the title text, nothing else.`;
}

/**
 * Builds a prompt for generating a story plan
 */
export function buildPlanPrompt(
  characters: string, 
  topic: string, 
  length: string
): string {
  // Determine the number of sections based on story length
  const sectionCount = length === "short" ? 3 : length === "medium" ? 5 : 7;
  
  return `Create a plan for a children's story with these details:
Characters: ${characters}
Topic: ${topic}
Length: ${sectionCount} sections

Create exactly ${sectionCount} brief section descriptions that form a coherent story arc with:
- A clear beginning that introduces the characters and setting
- A middle with rising action and challenges
- A satisfying resolution

IMPORTANT: Format your response as a valid JSON array of strings called "plan", with each string being a brief section description.
Example format: {"plan": ["Section 1 description", "Section 2 description", ...]}`;
}

/**
 * Builds a prompt for generating the text for a specific story section
 */
export function buildSectionTextPrompt(
  characters: string,
  topic: string,
  planItem: string,
  sectionIndex: number,
  totalSections: number,
  previousSectionsText: string
): string {
  const previousContext = sectionIndex > 0
    ? `\n\n--- Previous Story Context ---\n${previousSectionsText}\n----------------------------\n\n`
    : "";

  return `Write an engaging section of a children's story based on the following details and context.
Characters: ${characters}
Topic: ${topic}
Overall Plan Item for this Section: ${planItem}
Section Position: ${sectionIndex + 1} of ${totalSections}${previousContext}
Instructions for this section:
- Write approximately 50-80 words.
- Make it age-appropriate for children 5-8 years old.
- Use simple vocabulary and short sentences suitable for reading aloud.
- Include dialogue between characters where appropriate.
- Ensure this section logically follows the 'Previous Story Context' (if provided) and smoothly transitions to the next part of the story based on the overall plan.
- Specifically, this section should ${sectionIndex === 0
    ? "introduce the characters and setting."
    : sectionIndex === totalSections - 1
      ? "provide a satisfying conclusion to the story, wrapping up the events from the previous context."
      : `advance the plot based on the plan item ('${planItem}') and the previous context.`}
  
IMPORTANT: Respond with ONLY the generated text for this specific section (${sectionIndex + 1}). Do not repeat the previous context or include titles/section numbers in your response.`;
}

/**
 * Builds a prompt for generating an image for a story section
 */
export function buildImagePrompt(
  characters: string,
  planItem: string,
  sectionText: string
): string {
  // Note: We rely on the character avatar being passed into the generation model separately
  // for primary character style reference. This prompt focuses on scene and style consistency.
  return `Create an illustration for a section of a children's story based on the following details.

Characters: ${characters}
Scene Description from Plan: ${planItem}
Key Moment/Action from Text: ${sectionText.substring(0, 250)}...

Style Guidelines:
- Please generate this scene in a flat, vector-based cartoon style with bold, dark outlines defining all shapes.
- The characters should have simple, stylized features consistent with the provided avatar's design (if an avatar was provided), including the use of clean lines and a focus on clear, expressive shapes. Create *original* characters based *only* on these descriptions.
- **CRITICAL:** Avoid any resemblance to known copyrighted characters, brands, or specific art styles (e.g., do not make characters look like Thomas the Tank Engine, Disney characters, Peppa Pig, etc.). Focus on originality.
- Aim for a clean and graphic aesthetic with a potentially subtle, uniform texture overall.
- Ensure the style is consistent with any previously generated image context provided.
- Include relevant background elements to establish the setting based on the text.
- Focus on the main action described in the scene.
- **Output Aspect Ratio:** Aim for a widescreen 16:9 aspect ratio (approximately 800x460 pixels).

**Strict Constraints (Must Follow):**
- **Single Character:** The image must contain ONLY ONE instance of the main character described. Do NOT show the character multiple times.
- **No Text:** The image must NOT contain any letters, words, numbers, or text of any kind.
- **Single Frame:** The output must be a single, unified landscape image. Do NOT create multiple panels, frames, or comic-book-style layouts.

IMPORTANT: Respond ONLY with the image. Keep the style friendly and appropriate for young children. Maintain visual consistency with the character reference and any previous image context. **Generate original designs, avoiding copyrighted styles/characters.** **Strictly adhere to the constraints listed above.**`;
}

/**
 * Builds a prompt for generating story topic suggestions
 */
export function buildTopicSuggestionsPrompt(
  age: number,
  gender: string
): string {
  return `Suggest 9 simple, creative, and fun story *ideas* or *titles* suitable for a ${age}-year-old ${gender}.
Each suggestion should be a short phrase (1-6 words) that hints at a story, not just a description. For example, "The adventurous little star" is better than "A little star".
For each suggestion, provide the text and a string with 1-2 relevant emojis.
Return the suggestions ONLY as a JSON array of objects, where each object has a "text" key (string) and an "emojis" key (string).
Example format: [
  {"text": "A talking squirrel's big secret", "emojis": "🐿️🤫"},
  {"text": "The magical paintbrush", "emojis": "🖌️✨"},
  {"text": "The day the crayons quit", "emojis": "🖍️😠"},
  {"text": "Lost in the candy kingdom", "emojis": "🍬👑"}
]`;
} 