import OpenAI from "openai";
// import * as fs from "node:fs";
// import * as os from "node:os";
// import * as path from "node:path";
import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";
import * as admin from "firebase-admin";

// Import prompts - UNCOMMENTING imports now that prompts are defined
import {
  buildImagePrompt,
  buildCompleteStoryPrompt,
  buildTopicSuggestionsPrompt
} from "../../prompts";

// Import necessary types
import { StoryLength, TopicSuggestion } from "../../../../types";

// Define the secret parameter for the OpenAI API Key
const openAIApiKey = defineString("OPENAI_API_KEY");

// Initialize OpenAI client
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = openAIApiKey.value();
    if (!apiKey) {
      logger.error("OpenAI API Key is not configured. Set OPENAI_API_KEY secret.");
      throw new Error("API key configuration error for OpenAI.");
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// OpenAI configuration options
interface OpenAIConfig {
  temperature?: number;
  max_tokens?: number; // OpenAI uses snake_case
  model?: string; // Default models defined in each function
}

// OpenAI TTS configuration options
export interface OpenAITTSConfig {
  model?: string;
  voice?: string;
  speed?: number;
}

// Default OpenAI voices
export const OPENAI_VOICES = {
  FEMALE_YOUNG: "ballad", // Young female voice
  MALE_YOUNG: "ballad", // Young male voice
  FEMALE_CHILD: "ballad", // Neutral voice that can sound like a child
  MALE_CHILD: "ballad", // Friendly, warm voice that can work for a child
};

// Default TTS model
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts"; // DO NOT CHANGE THIS

/**
 * Generate audio using OpenAI TTS API
 * @param text Text to convert to speech
 * @param config OpenAI TTS configuration options
 * @returns Buffer containing audio data (MP3 format)
 */
export async function generateOpenAIAudio(
  text: string,
  config?: OpenAITTSConfig
): Promise<Buffer> {
  logger.info("Generating audio with OpenAI TTS");
  
  // Get OpenAI client
  const client = getOpenAIClient();
  
  // Get configuration options with defaults
  const model = config?.model || DEFAULT_TTS_MODEL;
  const voice = config?.voice || OPENAI_VOICES.MALE_YOUNG;
  const speed = config?.speed ?? 0.8; // Default if not provided
  
  try {
    logger.info(`Sending TTS request to OpenAI for text (${text.length} chars) with voice ${voice}`);
    
    // Use the OpenAI TTS API
    const response = await client.audio.speech.create({
      model,
      voice,
      // instructions: "Use a warm gentle voice", // Instructions may not be valid for tts-1
      input: text,
      speed,
      response_format: "mp3",
    });
    
    // Convert the response to a buffer
    const buffer = Buffer.from(await response.arrayBuffer());
    logger.info(`OpenAI audio generated successfully (${buffer.length} bytes)`);
    
    return buffer;
  } catch (error) {
    logger.error("OpenAI audio generation failed:", error);
    throw error;
  }
}

/**
 * Uploads OpenAI audio to Firebase Storage
 * Helper function to handle the common pattern of generating and storing
 * @param text Text content to convert to speech
 * @param storagePath Path in Firebase Storage where audio should be saved
 * @param config OpenAI TTS configuration options
 * @returns Public URL of the uploaded audio file
 */
export async function generateAndUploadOpenAIAudio(
  text: string,
  storagePath: string,
  config?: OpenAITTSConfig
): Promise<string> {
  try {
    logger.info(`Generating and uploading OpenAI audio to ${storagePath}`);
    
    // Generate the audio with OpenAI
    const audioBuffer = await generateOpenAIAudio(text, config);
    
    // Initialize Firebase Storage if needed
    const storage = admin.storage();
    const bucket = storage.bucket();
    const audioFile = bucket.file(storagePath);
    
    // Upload the audio buffer to Firebase Storage
    await audioFile.save(audioBuffer, { 
      metadata: { 
        contentType: "audio/mpeg" 
      } 
    });
    
    // Make the file publicly accessible
    await audioFile.makePublic();
    
    // Get the public URL for the audio file
    const audioUrl = audioFile.publicUrl();
    logger.info(`OpenAI audio successfully uploaded to ${storagePath}. URL: ${audioUrl}`);
    
    return audioUrl;
  } catch (error) {
    logger.error(`Failed to generate and upload OpenAI audio to ${storagePath}:`, error);
    throw error;
  }
}

// --- Interfaces for Complete Story Generation ---
// Moved these definitions above the function that uses them
interface GeneratedSection {
  text: string;
  imageBrief: string;
}

interface CompleteStoryResult {
  title: string;
  sections: GeneratedSection[];
}

// --- NEW: Generate Complete Story (Text and Image Briefs) ---
/**
 * Generate a complete story narrative and image briefs using OpenAI.
 * @param characters Character description string.
 * @param topic The main topic/theme of the story.
 * @param length Desired story length ('short', 'medium', 'long').
 * @param config Optional OpenAI configuration.
 * @returns A promise resolving to an object containing the story title and an array of sections, each with text and an image brief.
 */
export async function generateOpenAICompleteStory(
  characters: string,
  topic: string,
  length: StoryLength,
  config?: OpenAIConfig
): Promise<CompleteStoryResult> {
  const startTime = Date.now(); // Start timer
  try {
    logger.info("Generating complete story with OpenAI");
    const client = getOpenAIClient();

    // Build the comprehensive prompt using the new builder
    const prompt = buildCompleteStoryPrompt(characters, topic, length);

    // Use a more capable model for this complex task
    const model = config?.model || "gpt-4o";
    const maxTokens = config?.max_tokens || (length === "long" ? 4000 : length === "medium" ? 2500 : 1500);

    logger.info(`Sending request to ${model} for complete story generation.`);
    const response = await client.chat.completions.create({
      model: model,
      temperature: config?.temperature || 0.7,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }, // Request JSON output
      messages: [
        {
          role: "system",
          content: "You are a brilliant children's storyteller. Generate a complete story based on the user's request. The story should be divided into logical sections. For each section, provide the narrative text and a concise, visually descriptive brief (max 1-2 sentences) suitable for an image generation model (like DALL-E). Output a valid JSON object with the structure: {\"title\": \"Story Title\", \"sections\": [{\"text\": \"Section 1 narrative...\", \"imageBrief\": \"Image brief for section 1...\"}, ...]}"
        },
        { role: "user", content: prompt }
      ]
    });
    const endTime = Date.now(); // End timer
    logger.info(`OpenAI story generation request took ${endTime - startTime} ms.`); // Log duration

    const content = response.choices[0]?.message?.content;

    if (!content) {
      logger.error("OpenAI returned empty content for complete story.");
      throw new Error("AI failed to generate story content.");
    }

    try {
      // Parse the JSON response
      const parsedContent = JSON.parse(content) as CompleteStoryResult;

      // Basic validation
      if (
        parsedContent &&
        typeof parsedContent.title === "string" &&
        Array.isArray(parsedContent.sections) &&
        parsedContent.sections.every(
          (s: GeneratedSection) => typeof s.text === "string" && typeof s.imageBrief === "string"
        ) &&
        parsedContent.sections.length > 0
      ) {
        logger.info(`OpenAI generated story titled "${parsedContent.title}" with ${parsedContent.sections.length} sections.`);
        return parsedContent;
      } else {
        logger.warn("OpenAI story response structure mismatch. Raw:", content);
        throw new Error("AI response did not match expected format.");
      }
    } catch (parseError) {
      logger.error("Failed to parse OpenAI complete story JSON:", parseError, "Raw content:", content);
      throw new Error("Failed to parse AI story response.");
    }
  } catch (error) {
    const endTime = Date.now(); // End timer even on error
    logger.error(`OpenAI complete story generation failed after ${endTime - startTime} ms:`, error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("Unknown error during story generation.");
    }
  }
}

/**
 * Generates story topic suggestions using OpenAI.
 * @param age Approximate age of the child.
 * @param gender Gender of the child.
 * @param config Optional OpenAI configuration.
 * @returns A promise resolving to an array of TopicSuggestion objects.
 */
export async function generateOpenAITopicSuggestions(
  age: number,
  gender: string,
  config?: OpenAIConfig
): Promise<TopicSuggestion[]> {
  try {
    logger.info(`Generating topic suggestions for age ${age}, gender ${gender} with OpenAI`);
    const client = getOpenAIClient();

    // Build the prompt using the new builder
    const prompt = buildTopicSuggestionsPrompt(age, gender);
    const model = config?.model || "gpt-4o-mini"; // Mini is likely sufficient

    const response = await client.chat.completions.create({
      model: model,
      temperature: config?.temperature || 0.8,
      max_tokens: config?.max_tokens || 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You suggest creative and age-appropriate story topics for children. Include 1-2 relevant emojis for each topic. Output a valid JSON object with the structure: {\"topics\": [{\"text\": \"Topic text...\", \"emojis\": \"💡✨\"}, ...]}"
        },
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      logger.error("OpenAI returned empty content for topic suggestions.");
      throw new Error("AI failed to generate topic suggestions.");
    }

    try {
      const parsedContent = JSON.parse(content) as { topics: TopicSuggestion[] };

      if (
        parsedContent &&
        Array.isArray(parsedContent.topics) &&
        parsedContent.topics.every(
          (t: TopicSuggestion) => typeof t.text === "string" && typeof t.emojis === "string"
        ) &&
        parsedContent.topics.length > 0
      ) {
        logger.info(`OpenAI generated ${parsedContent.topics.length} topic suggestions.`);
        return parsedContent.topics;
      } else {
        logger.warn("OpenAI topic suggestions response structure mismatch. Raw:", content);
        throw new Error("AI response did not match expected topic format.");
      }
    } catch (parseError) {
      logger.error("Failed to parse OpenAI topic suggestions JSON:", parseError, "Raw content:", content);
      throw new Error("Failed to parse AI topic suggestions response.");
    }
  } catch (error) {
    logger.error("OpenAI topic suggestion generation failed:", error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("Unknown error during topic suggestion generation.");
    }
  }
}

/**
 * Generate an image for a story section using OpenAI DALL-E 3.
 * UPDATED: Uses imageBrief instead of planItem/sectionText.
 * @param characters Character description string (used for consistency).
 * @param imageBrief Concise visual description for the scene.
 * @param config Optional OpenAI configuration (only model is used for DALL-E).
 * @returns A promise resolving to the base64 encoded PNG image string (data URI).
 */
export async function generateOpenAIStorySectionImage(
  characters: string,
  imageBrief: string,
  // config?: OpenAIConfig // Config might not be needed if defaults are okay
): Promise<string> {
  const startTime = Date.now(); // Start timer
  try {
    logger.info("Generating section image with OpenAI gpt-image-1");
    const client = getOpenAIClient();

    // Build the image prompt using the provided brief and character info
    const prompt = buildImagePrompt(characters, imageBrief); 

    // Use gpt-image-1 model
    const model = "gpt-image-1"; // CHANGED model
    const size = "1024x1024"; // Keep standard size for now

    logger.info(`Sending request to ${model} with prompt based on image brief: "${imageBrief}"`);

    const response = await client.images.generate({
      model: model,
      prompt: prompt,
      size: size
    });
    const endTime = Date.now(); // End timer
    logger.info(`OpenAI image generation request took ${endTime - startTime} ms.`); // Log duration

    // Extract base64 data
    const base64Json = response.data[0]?.b64_json;
    if (!base64Json) {
      logger.error("OpenAI gpt-image-1 response missing image data.");
      throw new Error("AI failed to return image data.");
    }

    // Prepend the data URI scheme
    const imageDataUri = `data:image/png;base64,${base64Json}`;
    logger.info(`OpenAI gpt-image-1 image generated successfully (Data URI length: ${imageDataUri.length})`);

    return imageDataUri; // Return the base64 data URI
  } catch (error) {
    const endTime = Date.now(); // End timer even on error
    logger.error(`OpenAI image generation failed after ${endTime - startTime} ms:`, error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("Unknown error during image generation.");
    }
  }
}

// REMOVED: saveDebugFile function if it's no longer needed or move if still used elsewhere 