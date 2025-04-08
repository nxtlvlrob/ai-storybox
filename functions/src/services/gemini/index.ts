import { genkit } from "genkit";
import { googleAI, gemini20Flash } from "@genkit-ai/googleai";
import { vertexAI, imagen3 } from "@genkit-ai/vertexai";
import * as logger from "firebase-functions/logger";
import { GenerateTextInput, GenerateImageInput, StoryPlan, StoryLength } from "types";
import { 
  buildTitlePrompt, 
  buildPlanPrompt,
  buildSectionTextPrompt,
  buildImagePrompt
} from "../../prompts";

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
 * Generate story image using Imagen
 * @param input The input parameters for image generation
 * @returns URL to the generated image
 */
export async function generateImage(input: GenerateImageInput): Promise<string> {
  try {
    logger.info("Generating image with prompt:", input.textPrompt);
    
    const ai = initializeGenkit(input.config?.apiKey);
    
    // Construct the generate options
    const generateOptions: any = {
      model: imagen3,
      output: { format: "media" },
      config: {
        aspectRatio: "16:9",
      }
    };
    
    // Add the prompt based on whether we have a character image
    if (input.characterImageBase64) {
      generateOptions.prompt = [
        {
          inlineData: {
            mimeType: "image/png",
            data: input.characterImageBase64
          }
        },
        { 
          text: `${input.textPrompt}\nUse the provided image as the reference for the main character in this story.` 
        },
      ];
      logger.info("Using multimodal prompt with character image for image generation");
    } else {
      generateOptions.prompt = [{ text: input.textPrompt }];
      logger.info("Using text-only prompt for image generation");
    }
    
    logger.info("Sending image generation request with prompt");
    
    const imageResult = await ai.generate(generateOptions);
    
    // Debug log the full response structure
    logger.debug("Imagen response structure:", JSON.stringify({
      hasMedia: !!imageResult.media,
      hasOutput: !!imageResult.output,
      hasText: !!imageResult.text,
      keys: Object.keys(imageResult)
    }));
    
    // First check if we have a media object with URL
    if (imageResult.media && typeof imageResult.media.url === "string" && imageResult.media.url.trim() !== "") {
      logger.info(`Image generated successfully with media URL: ${imageResult.media.url.substring(0, 50)}...`);
      return imageResult.media.url;
    }
    
    // Check if the response includes a text property with a data URL
    if (imageResult.text && typeof imageResult.text === "string") {
      const text = imageResult.text.trim();
      // Check if text is a data URL or includes a URL
      if (text.startsWith("data:image/") || text.match(/https?:\/\/[\w.-]+/)) {
        logger.info(`Image URL found in text response: ${text.substring(0, 50)}...`);
        return text;
      }
    }
    
    // If we get here, no valid image URL was found
    logger.error("Image generation failed: No valid image URL found in response", JSON.stringify(imageResult));
    throw new Error("Image generation failed (no valid image URL in response)");
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
export async function generate(input: GenerateTextInput): Promise<string | any> {
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