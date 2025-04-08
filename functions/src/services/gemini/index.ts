import { genkit } from "genkit";
import { googleAI, gemini20Flash } from "@genkit-ai/googleai";
import { vertexAI } from "@genkit-ai/vertexai";
import { GoogleGenAI } from "@google/genai";
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
  config?: { apiKey?: string; temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const prompt = buildSectionTextPrompt(
    characters, 
    topic, 
    planItem, 
    sectionIndex, 
    totalSections
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
  config?: { apiKey?: string; temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const textPrompt = buildImagePrompt(characters, planItem, sectionText);
  return generateImage({ textPrompt, characterImageBase64, config });
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

/**
 * Generate story image using Gemini native image generation
 * @param input The input parameters for image generation
 * @returns URL to the generated image or Base64 encoded image data
 */
export async function generateImage(input: GenerateImageInput): Promise<string> {
  try {
    logger.info("Generating image with prompt:", input.textPrompt);
    
    // Retrieve the API key using the defined secret
    const apiKey = googleGenaiApiKey.value();
    if (!apiKey) {
      logger.error("Gemini API Key is not configured. Set GOOGLE_GENAI_API_KEY secret.");
      throw new Error("API key configuration error.");
    }
    // Cast explicitly to satisfy TypeScript
    const genAI = new GoogleGenAI({ apiKey });
    
    // Prepare the content parts for the request
    const contents: Array<string | { inlineData: { mimeType: string; data: string } }> = [];
    
    // Add text prompt
    contents.push(input.textPrompt);
    
    // Add character image if available
    if (input.characterImageBase64) {
      contents.push({
        inlineData: {
          mimeType: "image/png",
          data: input.characterImageBase64
        }
      });
      logger.info("Using multimodal prompt with character image for image generation");
    }
    
    logger.info("Sending image generation request with prompt");
    
    // Send the request with image generation capability
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents,
      config: {
        responseModalities: ["Text", "Image"],
        temperature: input.config?.temperature || 0.7,
        maxOutputTokens: input.config?.maxOutputTokens || 512
      }
    });
    
    // Log the structure of the response
    logger.debug("Image generation response structure:", JSON.stringify({
      hasResponse: !!response,
      hasText: !!response.text,
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length || 0,
      responseKeys: Object.keys(response)
    }));
    
    // Process the response to find image data
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        const parts = candidate.content.parts;
        
        // Look for the generated image in the response parts
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            // Return the base64 encoded image data with MIME type
            logger.info("Image generated successfully (base64 data)");
            return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
          }
        }
        
        // If no image found but text is present, log it for debugging
        for (const part of parts) {
          if (part.text) {
            logger.warn("Image generation returned text instead of image:", part.text);
          }
        }
      }
    }
    
    // If the response contains text directly, check if it's a URL or data URL
    if (response.text) {
      const text = response.text.trim();
      if (text.startsWith("data:image/") || text.match(/https?:\/\/[\w.-]+/)) {
        logger.info("Image URL found in text response");
        return text;
      }
    }
    
    // If we get here, no image was found in the response
    logger.error("Image generation failed: No image data in response", JSON.stringify(response));
    throw new Error("Image generation failed (no image data in response)");
  } catch (error) {
    logger.error("Image generation failed:", error);
    throw error;
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