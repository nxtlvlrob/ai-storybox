import OpenAI from "openai";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";
import * as admin from "firebase-admin";

// Import prompts
import {
  buildTitlePrompt,
  buildPlanPrompt,
  buildSectionTextPrompt,
  buildImagePrompt
} from "../../prompts";

// Import necessary types
import { StoryLength } from "types";

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
  FEMALE_YOUNG: "shimmer", // Young female voice
  MALE_YOUNG: "echo", // Young male voice
  FEMALE_CHILD: "alloy", // Neutral voice that can sound like a child
  MALE_CHILD: "fable", // Friendly, warm voice that can work for a child
};

// Default TTS model
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";

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
  const voice = config?.voice || OPENAI_VOICES.FEMALE_YOUNG;
  const speed = config?.speed ?? 1.0; // Default if not provided
  
  try {
    logger.info(`Sending TTS request to OpenAI for text (${text.length} chars) with voice ${voice}`);
    
    // Use the OpenAI TTS API
    const response = await client.audio.speech.create({
      model,
      voice,
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
    const audioFile = storage.bucket().file(storagePath);
    
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

/**
 * Generate a story title using OpenAI
 * @param characters Character description
 * @param topic Story topic
 * @param config OpenAI configuration options
 * @returns Generated title string
 */
export async function generateOpenAIStoryTitle(
  characters: string,
  topic: string,
  config?: OpenAIConfig
): Promise<string> {
  try {
    logger.info("Generating title with OpenAI");
    const client = getOpenAIClient();
    
    // Get the prompt from our prompt builder
    const prompt = buildTitlePrompt(characters, topic);
    
    // Create chat completion
    const response = await client.chat.completions.create({
      model: config?.model || "gpt-4o-mini", // Use mini for cost efficiency on simple tasks
      temperature: config?.temperature || 0.7,
      max_tokens: config?.max_tokens || 30, // Titles are short
      messages: [
        { role: "system", content: "You are a creative children's story title generator." },
        { role: "user", content: prompt }
      ]
    });
    
    // Extract the title
    const title = response.choices[0]?.message?.content?.trim() || "My Story";
    logger.info(`OpenAI generated title: "${title}"`);
    
    return title;
  } catch (error) {
    logger.error("OpenAI title generation failed:", error);
    throw error;
  }
}

/**
 * Generate a story plan using OpenAI
 * @param characters Character description
 * @param topic Story topic
 * @param length Story length
 * @param config OpenAI configuration options
 * @returns Array of plan strings
 */
export async function generateOpenAIStoryPlan(
  characters: string,
  topic: string,
  length: StoryLength,
  config?: OpenAIConfig
): Promise<string[]> {
  try {
    logger.info("Generating story plan with OpenAI");
    const client = getOpenAIClient();
    
    // Get the prompt from our prompt builder
    const prompt = buildPlanPrompt(characters, topic, length);
    
    // Create chat completion with JSON response mode
    const response = await client.chat.completions.create({
      model: config?.model || "gpt-4o-mini",
      temperature: config?.temperature || 0.7,
      max_tokens: config?.max_tokens || 1000,
      response_format: { type: "json_object" }, // Request JSON output
      messages: [
        { 
          role: "system", 
          content: "You are a creative children's story planner. You output valid JSON with a 'plan' array of strings." 
        },
        { role: "user", content: prompt }
      ]
    });
    
    // Extract and parse the plan
    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      logger.error("OpenAI returned empty plan content");
      return ["Beginning", "Middle", "End"];
    }
    
    try {
      // Parse the JSON response
      const parsedContent = JSON.parse(content);
      
      if (Array.isArray(parsedContent.plan) && parsedContent.plan.length > 0) {
        const plan = parsedContent.plan.filter((item: unknown): item is string => typeof item === "string");
        logger.info(`OpenAI generated plan with ${plan.length} sections.`);
        return plan;
      } else {
        // Fallback if structure doesn't match
        logger.warn("OpenAI plan didn't have expected structure. Response:", content);
      }
    } catch (parseError) {
      logger.error("Failed to parse OpenAI plan JSON:", parseError);
      logger.warn("Raw content:", content);
    }
    
    // Fallback to default
    return ["Beginning", "Middle", "End"];
  } catch (error) {
    logger.error("OpenAI plan generation failed:", error);
    throw error;
  }
}

/**
 * Generate story section text using OpenAI
 * @param characters Character description
 * @param topic Story topic
 * @param planItem Current section plan
 * @param sectionIndex Current section index
 * @param totalSections Total number of sections
 * @param previousSectionsText Previous sections text for continuity
 * @param config OpenAI configuration options
 * @returns Generated section text
 */
export async function generateOpenAIStorySectionText(
  characters: string,
  topic: string,
  planItem: string,
  sectionIndex: number,
  totalSections: number,
  previousSectionsText: string,
  config?: OpenAIConfig
): Promise<string> {
  try {
    logger.info(`Generating section ${sectionIndex} text with OpenAI`);
    const client = getOpenAIClient();
    
    // Get the prompt from our prompt builder
    const prompt = buildSectionTextPrompt(
      characters, 
      topic, 
      planItem, 
      sectionIndex, 
      totalSections,
      previousSectionsText
    );
    
    // Create chat completion
    const response = await client.chat.completions.create({
      model: config?.model || "gpt-4o", // Better quality for main content generation
      temperature: config?.temperature || 0.7,
      max_tokens: config?.max_tokens || 600, // For decent sized story sections
      messages: [
        { 
          role: "system", 
          content: "You are a children's story writer creating engaging, age-appropriate content. Respond with only the story text, no titles or section numbers."
        },
        { role: "user", content: prompt }
      ]
    });
    
    // Extract the generated text
    const generatedText = response.choices[0]?.message?.content?.trim() || "";
    
    if (!generatedText) {
      throw new Error("OpenAI text generation failed (empty content).");
    }
    
    // Clean up the response - remove any scene prefixes similar to the Gemini version
    const cleanedText = generatedText.replace(/^(Scene|Part|Chapter)\s+\d+[:.]\s*/i, "");
    
    logger.info(`OpenAI generated text (${cleanedText.length} chars) for section ${sectionIndex}`);
    return cleanedText;
  } catch (error) {
    logger.error(`OpenAI section ${sectionIndex} text generation failed:`, error);
    throw error;
  }
}

/**
 * Generate an image for a story section using DALL-E 3
 * @param characters Character description
 * @param planItem Current section plan
 * @param sectionText Current section text
 * @param config OpenAI configuration options
 * @returns Base64 encoded image data URI string
 */
export async function generateOpenAIStorySectionImage(
  characters: string,
  planItem: string,
  sectionText: string,
  config?: OpenAIConfig
): Promise<string> {
  try {
    logger.info("Generating image with DALL-E 3");
    const client = getOpenAIClient();
    
    // Get base prompt from our prompt builder but we need to adapt it for DALL-E
    // DALL-E cannot take previous images as input, so we adapt it
    const basePrompt = buildImagePrompt(characters, planItem, sectionText);
    
    // Extract just the prompt text without the instructions about responding with only an image
    // and keeping style consistent with previous images (since DALL-E can't see those)
    const promptLines = basePrompt.split("\n").filter(line => 
      !line.toLowerCase().includes("respond only with") && 
      !line.toLowerCase().includes("previous image")
    );
    
    // Add DALL-E specific style guidance
    const dallePrompt = `${promptLines.join("\n")}

Additional DALL-E specific instructions:
- Render in a flat, vector-based cartoon style with bold, dark outlines.
- Use solid, matte colors without gradients or complex shading.
- Stylize characters with simple, clean lines and clear, expressive shapes.
- Create a bright, cheerful look suitable for a children's storybook.
- Avoid any resemblance to known copyrighted characters or brands.
- Maintain a widescreen 16:9 aspect ratio composition.
- Focus on the main action described in the scene.`;
    
    logger.info("Adapted DALL-E prompt:", dallePrompt);
    
    // Generate the image with DALL-E 3
    const response = await client.images.generate({
      model: config?.model || "dall-e-3",
      prompt: dallePrompt,
      n: 1,
      size: "1792x1024", // Closest to 16:9 available in DALL-E 3
      quality: "standard",
      response_format: "b64_json", // Request base64 data
      style: "vivid" // For more vibrant colors suitable for children's stories
    });
    
    // Check if we have a response with base64 data
    const imageData = response.data[0]?.b64_json;
    if (!imageData) {
      logger.error("DALL-E returned no image data.");
      throw new Error("Image generation failed (no data returned).");
    }
    
    // Get the MIME type (should be image/png from DALL-E 3)
    const mimeType = "image/png";
    logger.info("DALL-E image generated successfully (base64 data)");
    
    // Return in the expected data URI format
    return `data:${mimeType};base64,${imageData}`;
  } catch (error) {
    logger.error("DALL-E image generation failed:", error);
    throw error;
  }
}

/**
 * Utility function to save temporary debug files (for development)
 */
export async function saveDebugFile(content: string, filename: string): Promise<string> {
  try {
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    logger.info(`Debug file saved to ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error("Failed to save debug file:", error);
    return "error";
  }
} 