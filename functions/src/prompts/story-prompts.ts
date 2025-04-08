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
  totalSections: number
): string {
  return `Write an engaging section of a children's story with these details:
Characters: ${characters}
Topic: ${topic}
Section description: ${planItem}
Section position: ${sectionIndex + 1} of ${totalSections}

Write approximately 150-200 words for this section. Make it age-appropriate for children 5-8 years old.
Use simple vocabulary and short sentences that are easy to read aloud.
Include dialogue between characters where appropriate.
This section should ${sectionIndex === 0 
    ? "introduce the characters and setting" 
    : sectionIndex === totalSections - 1 
      ? "provide a satisfying conclusion to the story" 
      : "advance the plot in an engaging way"}.

IMPORTANT: Respond with ONLY the section text, no titles or section numbers.`;
}

/**
 * Builds a prompt for generating an image for a story section
 */
export function buildImagePrompt(
  characters: string,
  planItem: string,
  sectionText: string
): string {
  return `Create a colorful, child-friendly illustration for a section of a children's story with these details:
Characters: ${characters}
Scene description: ${planItem}

The scene should depict: ${sectionText.substring(0, 200)}...

Style guidelines:
- Create a bright, cheerful, and whimsical illustration suitable for children ages 5-8
- Use a colorful, appealing palette with clean lines
- Characters should be expressive and appealing, not scary
- Create a storybook illustration style (like classic children's books)
- Include relevant background elements to establish the setting
- Focus on the main action described in the scene

IMPORTANT: This is for a children's story, so keep the style friendly and appropriate for young children.`;
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