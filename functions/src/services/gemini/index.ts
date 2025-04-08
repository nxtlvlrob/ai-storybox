import { genkit } from "genkit";
import { googleAI, gemini20Flash } from "@genkit-ai/googleai";
import { vertexAI } from "@genkit-ai/vertexai";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";
import { GenerateTextInput, GenerateImageInput, StoryPlan, StoryLength } from "types";
import { 
  buildTitlePrompt, 
  buildPlanPrompt,
  buildSectionTextPrompt,
  buildImagePrompt
} from "../../prompts";

// Define the secret parameter for the Gemini API Key
const googleGenaiApiKey = defineString("GOOGLE_GENAI_API_KEY");

// Initialize Genkit client with required plugins
function initializeGenkit(apiKey?: string) {
  return genkit({
    plugins: [
      googleAI(apiKey ? { apiKey } : undefined),
      vertexAI({ location: "us-central1" }),
    ],
  });
}

/**
 * Helper function to generate a story title 
 */
export async function generateStoryTitle(
  characters: string,
  topic: string,
  config?: { apiKey?: string; temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const prompt = buildTitlePrompt(characters, topic);
  return generateTitle({ prompt, config });
}

/**
 * Helper function to generate a story plan
 */
export async function generateStoryPlan(
  characters: string,
  topic: string,
  length: StoryLength,
  config?: { apiKey?: string; temperature?: number; maxOutputTokens?: number }
): Promise<string[]> {
  const prompt = buildPlanPrompt(characters, topic, length);
  return generatePlan({ prompt, config, outputFormat: "json" });
}

/**
 * Helper function to generate text for a story section
 */
export async function generateStorySectionText(
  characters: string,
  topic: string,
  planItem: string,
  sectionIndex: number,
  totalSections: number,
  previousSectionsText: string,
  config?: { apiKey?: string; temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const prompt = buildSectionTextPrompt(
    characters, 
    topic, 
    planItem, 
    sectionIndex, 
    totalSections,
    previousSectionsText
  );
  return generateSectionText({ prompt, config });
}

/**
 * Helper function to generate an image for a story section
 */
export async function generateStorySectionImage(
  characters: string,
  planItem: string,
  sectionText: string,
  characterImageBase64?: string | null,
  previousImageDataBase64?: string | null,
  config?: { apiKey?: string; temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const textPrompt = buildImagePrompt(characters, planItem, sectionText);
  return generateImage({ textPrompt, characterImageBase64, previousImageDataBase64, config });
}

/**
 * Generate a story title using Gemini
 * @param input The input parameters for title generation
 * @returns The generated title string
 */
export async function generateTitle(input: GenerateTextInput): Promise<string> {
  try {
    logger.info("Generating title with prompt:", input.prompt);
    
    const ai = initializeGenkit(input.config?.apiKey);
    
    const titleResult = await ai.generate({
      model: gemini20Flash,
      prompt: input.prompt,
      config: { 
        temperature: input.config?.temperature || 0.7,
        maxOutputTokens: input.config?.maxOutputTokens || 256,
      },
    });
    
    const title = titleResult.text?.trim() || "My Story";
    logger.info(`Generated title: "${title}"`);
    
    return title;
  } catch (error) {
    logger.error("Title generation failed:", error);
    throw error;
  }
}

/**
 * Generate a story plan using Gemini
 * @param input The input parameters for plan generation
 * @returns An array of plan strings
 */
export async function generatePlan(input: GenerateTextInput): Promise<string[]> {
  try {
    logger.info("Generating plan with prompt:", input.prompt);
    
    const ai = initializeGenkit(input.config?.apiKey);
    
    const planResult = await ai.generate({
      model: gemini20Flash,
      prompt: input.prompt,
      output: { format: "json" },
      config: { 
        temperature: input.config?.temperature || 0.7,
        maxOutputTokens: input.config?.maxOutputTokens || 512,
      },
    });
    
    // First try to extract from structured JSON
    const parsedPlan = planResult.output as StoryPlan | undefined;
    if (parsedPlan?.plan && Array.isArray(parsedPlan.plan)) {
      const plan = parsedPlan.plan.filter((item: unknown): item is string => typeof item === "string");
      if (plan.length > 0) {
        logger.info(`Generated plan with ${plan.length} sections.`);
        return plan;
      }
    }
    
    // Fallback parsing from raw text
    const rawText = planResult.text;
    logger.warn(`Plan JSON parsing failed, attempting fallback on raw text: ${rawText}`);
    try {
      const fallbackParsed = JSON.parse(rawText || "{}");
      if (fallbackParsed?.plan && Array.isArray(fallbackParsed.plan)) {
        const plan = fallbackParsed.plan.filter((item: unknown): item is string => typeof item === "string");
        if (plan.length > 0) {
          logger.info(`Generated plan from fallback parsing with ${plan.length} sections.`);
          return plan;
        }
      } else if (Array.isArray(fallbackParsed)) {
        const plan = fallbackParsed.filter((item: unknown): item is string => typeof item === "string");
        if (plan.length > 0) {
          logger.info(`Generated plan from direct array with ${plan.length} sections.`);
          return plan;
        }
      }
    } catch (e) {
      logger.error("Fallback parsing failed:", e);
    }
    
    // Final fallback to default
    logger.error(`Failed to parse plan from response: ${rawText}`);
    return ["Beginning", "Middle", "End"];
  } catch (error) {
    logger.error("Plan generation failed:", error);
    throw error;
  }
}

/**
 * Generate story section text using Gemini
 * @param input The input parameters for section text generation
 * @returns The generated section text
 */
export async function generateSectionText(input: GenerateTextInput): Promise<string> {
  try {
    logger.info("Generating section text with prompt:", input.prompt);
    
    const ai = initializeGenkit(input.config?.apiKey);
    
    const textResult = await ai.generate({
      model: gemini20Flash,
      prompt: input.prompt,
      config: { 
        temperature: input.config?.temperature || 0.7,
        maxOutputTokens: input.config?.maxOutputTokens || 512,
      },
    });
    
    const generatedText = textResult.text?.trim() || "";
    
    if (!generatedText) {
      throw new Error("Text generation failed (empty content).");
    }
    
    // Clean up the response - remove any scene prefixes
    const cleanedText = generatedText.replace(/^(Scene|Part|Chapter)\s+\d+[:.]\s*/i, "");
    
    logger.info(`Generated text (${cleanedText.length} chars)`);
    return cleanedText;
  } catch (error) {
    logger.error("Section text generation failed:", error);
    throw error;
  }
}

// Extend the GenerateImageInput type to include the optional previous image
interface GenerateImageInputExtended extends GenerateImageInput {
  previousImageDataBase64?: string | null;
}

/**
 * Generate story image using Gemini native image generation
 * @param input The input parameters for image generation, including optional previous image
 * @returns Base64 encoded image data URI string
 */
export async function generateImage(input: GenerateImageInputExtended): Promise<string> {
  const tempFilePaths: string[] = []; // Keep track of ALL temp files

  // Helper function to upload base64 image and return file data part
  async function uploadImagePart(
    fileManager: GoogleAIFileManager,
    base64Data: string,
    displayName: string,
    mimeType = "image/png"
  ): Promise<{ fileData: { mimeType: string; fileUri: string } } | null> {
    try {
      const cleanBase64 = base64Data.startsWith("data:")
        ? base64Data.substring(base64Data.indexOf(",") + 1)
        : base64Data;
      const imageBuffer = Buffer.from(cleanBase64, "base64");

      const tempFileName = `temp-${displayName.replace(/[^a-z0-9]/gi, "_")}-${Date.now()}.png`;
      const tempFilePath = path.join(os.tmpdir(), tempFileName);
      tempFilePaths.push(tempFilePath); // Track for cleanup

      fs.writeFileSync(tempFilePath, imageBuffer);
      logger.info(`Temporary image saved to: ${tempFilePath} for ${displayName}`);

      const uploadResult = await fileManager.uploadFile(tempFilePath, { mimeType, displayName });
      const file = uploadResult.file;
      logger.info(`Uploaded ${displayName}: ${file.name} (URI: ${file.uri})`);

      return {
        fileData: {
          mimeType: file.mimeType,
          fileUri: file.uri,
        },
      };
    } catch (uploadError) {
      logger.error(`Failed to upload ${displayName}:`, uploadError);
      // Allow proceeding without the image if upload fails, but log it
      return null;
    }
  }

  try {
    logger.info("Generating image with prompt:", input.textPrompt);

    const apiKey = googleGenaiApiKey.value();
    if (!apiKey) {
      logger.error("Gemini API Key is not configured. Set GOOGLE_GENAI_API_KEY secret.");
      throw new Error("API key configuration error.");
    }

    const genAI = new GoogleGenAI({ apiKey });
    const fileManager = new GoogleAIFileManager(apiKey);

    const contents: Array<string | { fileData: { mimeType: string; fileUri: string } }> = [input.textPrompt];

    // Upload character image (if provided)
    if (input.characterImageBase64) {
      logger.info("Character avatar provided, attempting upload...");
      const characterImagePart = await uploadImagePart(fileManager, input.characterImageBase64, "character-avatar");
      if (characterImagePart) {
        contents.push(characterImagePart);
        logger.info("Added character avatar reference to prompt.");
      }
    }

    // Upload previous image context (if provided)
    if (input.previousImageDataBase64) {
      logger.info("Previous image context provided, attempting upload...");
      const previousImagePart = await uploadImagePart(fileManager, input.previousImageDataBase64, "previous-image");
      if (previousImagePart) {
        contents.push(previousImagePart);
        logger.info("Added previous image context reference to prompt.");
      }
    }

    logger.info(`Sending image generation request with ${contents.length - 1} image inputs.`);

    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents,
      config: {
        responseModalities: ["image", "text"],
        temperature: input.config?.temperature || 0.7,
        maxOutputTokens: input.config?.maxOutputTokens || 8192,
        responseMimeType: "text/plain",
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ]
      }
    });

    logger.debug("Image generation response structure:", JSON.stringify({
      hasResponse: !!response,
      hasText: !!response.text,
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length || 0,
    }, null, 2));

    // Process the response to find image data
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const mimeType = part.inlineData.mimeType || "image/png";
            logger.info(`Image generated successfully (base64 data, mime: ${mimeType})`);
            return `data:${mimeType};base64,${part.inlineData.data}`; // ALWAYS return base64 data URI
          }
          if (part.text) { // Log any text part found
            logger.warn("Image generation returned text part:", part.text);
          }
        }
      }
    }

    // Check for text response as fallback (e.g., error message from model)
    if (response.text) {
      const text = response.text.trim();
      logger.error("Image generation failed: Model returned only text.", { responseText: text });
      throw new Error(`Image generation failed: Model returned text - ${text.substring(0, 100)}`);
    }

    // If we get here, no image data was found, log the full response
    logger.error(
      "Image generation failed: No image data found in response parts.",
      { fullResponse: JSON.stringify(response) }
    );
    throw new Error("Image generation failed (no image data in response)");

  } catch (error) {
    logger.error("Image generation failed with exception:", error);
    throw error; // Re-throw the error after logging
  } finally {
    // Clean up ALL temporary files
    tempFilePaths.forEach(tempFilePath => {
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          logger.info(`Successfully deleted temporary file: ${tempFilePath}`);
        } catch (cleanupError) {
          logger.error(`Failed to delete temporary file ${tempFilePath}:`, cleanupError);
        }
      }
    });
  }
}

/**
 * General-purpose text generation using Gemini
 * @param input The input parameters for text generation
 * @returns The generated text or parsed JSON object
 */
export async function generate(input: GenerateTextInput): Promise<string | Record<string, unknown>> {
  try {
    logger.info("General text generation with prompt:", input.prompt);
    
    const ai = initializeGenkit(input.config?.apiKey);
    
    const result = await ai.generate({
      model: gemini20Flash,
      prompt: input.prompt,
      output: input.outputFormat === "json" ? { format: "json" } : undefined,
      config: { 
        temperature: input.config?.temperature || 0.7,
        maxOutputTokens: input.config?.maxOutputTokens || 512,
      },
    });
    
    // Return structured output if JSON was requested
    if (input.outputFormat === "json") {
      return result.output || JSON.parse(result.text || "{}");
    }
    
    // Otherwise return the text
    return result.text?.trim() || "";
  } catch (error) {
    logger.error("Text generation failed:", error);
    throw error;
  }
} 