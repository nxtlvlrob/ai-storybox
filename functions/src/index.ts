/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { DocumentSnapshot, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

// Import Google Cloud AI Platform and TTS clients
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

// Genkit Imports
import { genkit } from "genkit";
import { googleAI, gemini20Flash } from "@genkit-ai/googleai";
import { vertexAI, imagen3 } from "@genkit-ai/vertexai"; // Import Imagen model

// Import types using the path alias
import { StoryDocument, StoryStatus, StorySection, UserProfile } from "../../types";
import { Character } from "../../types";

import { Resvg } from "@resvg/resvg-js";
import { URL } from "url"; // Import the URL class from Node.js

// Firebase specific types
export type StoryDocumentWriteData = Omit<StoryDocument, "createdAt" | "updatedAt"> & {
  createdAt: FieldValue | Timestamp;
  updatedAt: FieldValue | Timestamp;
};

// Initialize Firebase Admin SDK (should be done once)
// Functions environment automatically initializes, but explicit init is safe
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage(); // Initialize storage for saving audio/images

// Keep TTS Client initialization
const ttsClient = new TextToSpeechClient();

// Helper function to download SVG from a Storage URL and convert to PNG base64 string
async function convertSvgUrlToPngBase64(svgUrl: string, storyId: string): Promise<string | null> {
  let relativePath: string | null = null;
  try {
    logger.info(`[${storyId}] Starting SVG download and conversion for URL: ${svgUrl}`);

    // 1. Parse the URL to extract the relative path
    const parsedUrl = new URL(svgUrl);
    // Example pathname: /v0/b/your-bucket-name.appspot.com/o/avatars%2Fuser_id%2Favatar.svg
    const pathSegments = parsedUrl.pathname.split("/o/");
    if (pathSegments.length < 2) {
      throw new Error("Could not extract relative path from SVG URL pathname.");
    }
    // Get the URL-encoded path part after '/o/'
    const encodedPath = pathSegments[1];
    // Decode the path (e.g., 'avatars%2Fuser_id%2Favatar.svg' -> 'avatars/user_id/avatar.svg')
    relativePath = decodeURIComponent(encodedPath);
    logger.info(`[${storyId}] Extracted relative path: ${relativePath}`);

    // 2. Get reference to the file using the relative path
    const bucket = storage.bucket(); // Assumes default bucket
    const file = bucket.file(relativePath);

    // 3. Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      logger.warn(`[${storyId}] SVG file not found at relative path: ${relativePath} (derived from URL: ${svgUrl})`);
      return null;
    }

    // 4. Download the SVG file content
    logger.info(`[${storyId}] Downloading SVG content from relative path: ${relativePath}...`);
    const [svgBuffer] = await file.download();
    const svgString = svgBuffer.toString("utf-8");
    logger.info(`[${storyId}] SVG content downloaded (length: ${svgString.length}).`);

    // 5. Use Resvg to convert the SVG string to PNG
    const resvg = new Resvg(svgString, {
      fitTo: { mode: "width", value: 512 },
      font: { loadSystemFonts: false, defaultFontFamily: "sans-serif" },
    });
    const pngData = await resvg.render();
    const pngBuffer = pngData.asPng();
    logger.info(`[${storyId}] SVG converted to PNG buffer.`);

    const pngBase64 = pngBuffer.toString("base64");
    logger.info(`[${storyId}] PNG buffer encoded to base64 string (length: ${pngBase64.length}).`);
    return pngBase64;

  } catch (error) {
    const pathInfo = relativePath ? `relative path ${relativePath}` : `URL ${svgUrl}`;
    logger.error(`[${storyId}] Failed during SVG download or conversion for ${pathInfo}:`, error);
    return null;
  }
}

// === Main Cloud Function: Orchestrate Story Generation (Refactored with Genkit) ===

// Define runtime options for v2 trigger
const runtimeOpts = {
  timeoutSeconds: 540, // Keep timeout
  memory: "1GiB" as const, // May need more memory for AI tasks
};

export const generateStoryPipeline = onDocumentCreated(
  { document: "stories/{storyId}", ...runtimeOpts },
  async (event): Promise<void> => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data associated with the event");
      return;
    }
    const storyId = event.params.storyId;
    const storyData = snapshot.data() as StoryDocument;
    const storyRef = snapshot.ref;
    const userId = storyData.userId;

    logger.info(`[${storyId}] Genkit: Starting pipeline for user ${userId}...`);

    // Check initial status (Should be 'queued', set by UI)
    if (storyData.status !== "queued") {
      logger.warn(`[${storyId}] Function triggered for story not in 'queued' state (${storyData.status}). Skipping.`);
      return;
    }

    // Initialize Genkit with required plugins
    const ai = genkit({
      plugins: [
        googleAI(), // For Gemini models
        vertexAI({ location: "us-central1" }), // For Imagen models, specify location
      ],
    });

    // --- 1. Initial Status Update ---
    try {
      logger.info(`[${storyId}] Updating status to 'planning'...`);
      await storyRef.update({
        status: "planning" as StoryStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: null,
      });
    } catch (error) {
      logger.error(`[${storyId}] Failed to update status to 'planning':`, error);
      return; // Stop if status update fails
    }

    // --- 2. Fetch Character Details AND User Profile ---
    let characters: Character[] = [];
    let userProfile: UserProfile | null = null;
    let actualPngBase64: string | null = null; // Variable to hold the final PNG base64

    try {
      logger.info(`[${storyId}] Fetching profile for user ${userId}...`);
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        userProfile = userDoc.data() as UserProfile;
        logger.info(`[${storyId}] User profile fetched.`);
        // Check if avatarUrl (containing the storage URL) exists
        if (userProfile.avatarUrl) {
          logger.info(`[${storyId}] Found avatarUrl (storage URL): ${userProfile.avatarUrl}`);
          // *** Call the updated function with the storage URL ***
          actualPngBase64 = await convertSvgUrlToPngBase64(userProfile.avatarUrl, storyId); // Use the renamed function
          if (actualPngBase64) {
            logger.info(`[${storyId}] Successfully converted SVG from storage URL to PNG base64.`);
          } else {
            logger.warn(`[${storyId}] Failed to convert SVG from storage URL to PNG base64.`);
          }
        } else {
          logger.info(`[${storyId}] No avatarUrl field found in user profile.`);
        }
      } else {
        logger.warn(`[${storyId}] User profile not found for ${userId}. Cannot fetch avatar.`);
      }

      // Fetch Characters (as before)
      if (storyData.characterIds && storyData.characterIds.length > 0) {
        logger.info(`[${storyId}] Fetching details for characters: ${storyData.characterIds.join(", ")}`);
        const characterPromises = storyData.characterIds.map((id: string) =>
          db.collection("characters").doc(id).get()
        );
        const characterSnapshots = await Promise.all(characterPromises);
        characters = characterSnapshots
          .filter((doc: DocumentSnapshot) => doc.exists)
          .map((doc: DocumentSnapshot) => ({ id: doc.id, ...doc.data() } as Character));
        if (characters.length !== storyData.characterIds.length) {
          logger.warn(`[${storyId}] Some characters not found.`);
        }
        logger.info(`[${storyId}] Fetched ${characters.length} characters.`);
      }
    } catch (error) {
      logger.error(`[${storyId}] Failed fetching user profile or characters:`, error);
      await storyRef.update({
        status: "error" as StoryStatus,
        errorMessage: `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const characterDescriptions = characters.map((c) => `- ${c.name}: ${c.description}`).join("\n");
    const characterDetailsString = characters.map((c) => `${c.name} (${c.description})`).join(", ");

    // Create clearer strings for prompt injection
    const characterNames = characters.map((c) => c.name).join(", ");
    const characterDescriptionsForPrompt = characters.map((c) => `- ${c.name}: ${c.description}`).join("\n"); // Detailed list for context
    const characterMention = characters.length > 0 ? `Include the character(s) ${characterNames} in the story.` : "";
    // Use characterDescriptionsForPrompt if actualPngBase64 is null
    const characterVisualDescription = characters.length > 0 && !actualPngBase64
      ? `Characters visually described as:\n${characterDescriptionsForPrompt}`
      : ""; // Don't add text description if image is provided

    // --- 3. Generate Title and Plan (using Genkit) ---
    let title = "My Story"; // Default title
    let plan: string[] = [];
    try {
      logger.info(`[${storyId}] Generating title and plan using Genkit Gemini...`);

      // Generate Title
      const titlePrompt = `Create a short, catchy title (3-7 words) for a children's story about "${storyData.topic || "adventure"}". ${characters.length > 0 ? `Characters: ${characterDetailsString}` : ""}. Respond ONLY with the title text.`;
      const titleResult = await ai.generate({
        model: gemini20Flash,
        prompt: titlePrompt,
        config: { temperature: 0.7 },
      });
      title = titleResult.text?.trim() || title; // Use generated title or default
      logger.info(`[${storyId}] Generated title: "${title}"`);

      // Generate Plan
      const planLength = storyData.length === "short" ? 3 : storyData.length === "long" ? 7 : 5;
      const planPrompt = `Create a simple story plan (JSON array) for a children's story. Title: "${title}". Topic: "${storyData.topic || "adventure"}". ${characters.length > 0 ? `
Characters:
${characterDescriptions}` : ""}
Plan should have exactly ${planLength} simple scenes. Respond ONLY with a JSON object containing a "plan" key with an array of strings. Example: {"plan": ["Scene 1...", "Scene 2..."]}`;

      const planResult = await ai.generate({
        model: gemini20Flash,
        prompt: planPrompt,
        output: { format: "json" }, // Request JSON
        config: { temperature: 0.7 },
      });

      // Genkit handles JSON parsing when format: 'json' is used
      const parsedPlan = planResult.output;
      if (parsedPlan?.plan && Array.isArray(parsedPlan.plan)) {
        plan = parsedPlan.plan.filter((item: unknown): item is string => typeof item === "string");
      } else {
        // Attempt to parse raw text if JSON structure is wrong
        const rawText = planResult.text;
        logger.warn(`[${storyId}] Plan JSON parsing failed, attempting fallback on raw text: ${rawText}`);
        try {
          const fallbackParsed = JSON.parse(rawText || "{}");
          if (fallbackParsed?.plan && Array.isArray(fallbackParsed.plan)) {
            plan = fallbackParsed.plan.filter((item: unknown): item is string => typeof item === "string");
          } else if (Array.isArray(fallbackParsed)) { // If it's just an array
            plan = fallbackParsed.filter((item: unknown): item is string => typeof item === "string");
          }
        } catch (e) {/* ignore fallback parse error */ }
      }

      if (plan.length === 0) {
        throw new Error(`Parsed plan was empty. Raw response: ${planResult.text}`);
      }
      logger.info(`[${storyId}] Generated plan with ${plan.length} sections.`);

      // --- 4. Immediate Firestore Update (Title, Plan, Initial Sections) ---
      const initialSectionsData: StorySection[] = plan.map((planItem, index) => ({
        index,
        planItem,
        text: null,
        imageUrl: null,
        audioUrl: null,
      }));
      const firstStatus: StoryStatus = "generating_text_0"; // Start background generation
      const initialUpdateData: Partial<StoryDocumentWriteData> = {
        title,
        plan,
        sections: initialSectionsData,
        status: firstStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: null, // Clear any previous error
      };
      await storyRef.update(initialUpdateData);
      logger.info(`[${storyId}] Initial story structure saved. Status: '${firstStatus}'.`);
    } catch (error) {
      logger.error(`[${storyId}] Failed generating title/plan:`, error);
      await storyRef.update({
        status: "error" as StoryStatus,
        errorMessage: `Failed generating title/plan: ${error instanceof Error ? error.message : String(error)}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    // --- 5. Background Section Generation Loop (Refactored) ---
    let previousText = "The story begins."; // Context for first section
    // Update style lock with user request
    const STYLE_LOCK = "Flat Illustrated with Texture (Adventure Time / Steven Universe Inspired), simple, friendly, colorful.";

    for (let index = 0; index < plan.length; index++) {
      const currentPlanItem = plan[index];
      let generatedText: string | null = null;
      let generatedImageUrl: string | null = null;
      let generatedAudioUrl: string | null = null;

      // --- 5a. Generate Text ---
      try {
        const textStatus: StoryStatus = `generating_text_${index}`;
        logger.info(`[${storyId}] Updating status to '${textStatus}'`);
        await storyRef.update({ status: textStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        // Update text prompt to include character mention
        const textPrompt = `Continue the children's story titled "${title}". Scene: "${currentPlanItem}"\nPrevious part: "${previousText}"\n${characterMention}\nWrite 2-4 simple, engaging sentences suitable for a 3-8 year old. Respond ONLY with the text for this section.`;

        const textResult = await ai.generate({
          model: gemini20Flash,
          prompt: textPrompt,
          config: { temperature: 0.7, maxOutputTokens: 256 },
        });
        generatedText = textResult.text?.trim() || null;

        if (!generatedText) throw new Error("Text generation failed (empty content).");

        previousText = generatedText; // Update context for next iteration
        logger.info(`[${storyId}] Generated text for section ${index}.`);
      } catch (error) {
        logger.error(`[${storyId}] Text gen failed (sec ${index}):`, error);
        await storyRef.update({
          status: "error" as StoryStatus,
          errorMessage: `Text generation failed (section ${index}): ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return; // Stop processing on error
      }

      // --- 5b. Generate Image ---
      try {
        const imageStatus: StoryStatus = `generating_image_${index}`;
        logger.info(`[${storyId}] Updating status to '${imageStatus}'`);
        await storyRef.update({ status: imageStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let imagePrompt: any;
        const baseTextPrompt = `Illustration in a ${STYLE_LOCK} style. Scene depicting: ${generatedText}.`;

        // Check if we successfully got PNG base64 data from the user profile SVG
        if (actualPngBase64 && characters.length > 0) {
          const characterName = characters[0].name;
          const characterImagePart = {
            inlineData: {
              mimeType: "image/png",
              data: actualPngBase64
            }
          };
          imagePrompt = [
            characterImagePart,
            { text: `${baseTextPrompt}\nUse the provided image for the character named ${characterName}.` },
          ];
          logger.info(`[${storyId}] Using multimodal prompt with converted PNG avatar for section ${index}.`);
        } else {
          // Fallback to text-only prompt using descriptions
          imagePrompt = `${baseTextPrompt}\n${characterVisualDescription}`;
          logger.info(`[${storyId}] Using text-only image prompt for section ${index}. PNG Base64 available: ${!!actualPngBase64}, Characters: ${characters.length}`);
        }

        const imageResult = await ai.generate({
          model: imagen3,
          prompt: imagePrompt, // Pass the constructed prompt
          output: { format: "media" },
        });

        logger.debug(`[${storyId}] Full imageResult.media object for section ${index}: ${JSON.stringify(imageResult?.media, null, 2)}`);

        const media = imageResult.media;

        // Validate the media response
        if (!media || typeof media.url !== "string" || media.url.trim() === "") {
          logger.error(`[${storyId}] Image generation failed for section ${index}. Reason: Invalid or missing media.url. Response: ${JSON.stringify(imageResult)}`);
          throw new Error("Image generation failed (invalid media URL received).");
        }

        const potentialUrl = media.url;

        // Check if the result is a data URI or a GCS URL
        if (potentialUrl.startsWith("data:image/png;base64,")) {
          logger.warn(`[${storyId}] Image generation returned a base64 data URI for section ${index}. Uploading to GCS...`);

          // Extract base64 data
          const base64Data = potentialUrl.replace(/^data:image\/png;base64,/, "");
          const imageBuffer = Buffer.from(base64Data, "base64");

          // Define GCS path
          const imagePath = `stories/${storyId}/images/section_${index}.png`;
          const imageFile = storage.bucket().file(imagePath);

          // Upload the image buffer to GCS
          logger.info(`[${storyId}] Uploading base64 image to ${imagePath}...`);
          await imageFile.save(imageBuffer, { metadata: { contentType: "image/png" } });
          await imageFile.makePublic();
          generatedImageUrl = imageFile.publicUrl(); // Store the GCS URL

          logger.info(`[${storyId}] Base64 image successfully uploaded for section ${index}. URL: ${generatedImageUrl}`);

        } else if (potentialUrl.startsWith("https://") || potentialUrl.startsWith("http://")) {
          // Assume it's a standard URL (hopefully a GCS one)
          generatedImageUrl = potentialUrl; // Assign the URL directly
          logger.info(`[${storyId}] Image URL obtained directly for section ${index}: ${generatedImageUrl}`);
        } else {
          // URL format is unrecognized
          logger.error(`[${storyId}] Image generation failed for section ${index}. Reason: Received URL is not a data URI or a standard HTTP(S) URL. URL: ${potentialUrl}`);
          throw new Error("Image generation failed (unrecognized URL format).");
        }

      } catch (error) {
        logger.error(`[${storyId}] Image gen failed (sec ${index}):`, error);
        // Ensure error message includes the actual error if possible
        const errorMessage = error instanceof Error ? error.message : String(error);
        await storyRef.update({
          status: "error" as StoryStatus,
          errorMessage: `Image generation failed (section ${index}): ${errorMessage}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return; // Stop processing
      }

      // --- 5c. Generate Audio ---
      try {
        const audioStatus: StoryStatus = `generating_audio_${index}`;
        logger.info(`[${storyId}] Updating status to '${audioStatus}'`);
        await storyRef.update({ status: audioStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        // Use generated text (must exist)
        if (!generatedText) {
          // Added safety check, though theoretically unreachable if 5a succeeded
          throw new Error("Cannot generate audio, generatedText is unexpectedly null.");
        }

        // **Updated TTS Request Configuration**
        const ttsRequest = {
          input: { text: generatedText },
          // Updated Voice selection
          voice: {
            languageCode: "en-US",
            name: "en-US-Chirp3-HD-Achernar", // New voice name
          },
          // Updated Audio Configuration
          audioConfig: {
            audioEncoding: "LINEAR16" as const, // New encoding
            effectsProfileId: ["small-bluetooth-speaker-class-device"], // Added effects profile
            pitch: 0, // Added pitch
            speakingRate: 1, // Added speaking rate
          },
        };
        logger.info(`[${storyId}] Sending TTS request for section ${index} with config: ${JSON.stringify(ttsRequest)}`); // Log the request config

        const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
        if (!ttsResponse.audioContent) throw new Error("TTS returned no audio content.");
        logger.info(`[${storyId}] TTS response received for section ${index}. Content length: ${ttsResponse.audioContent.length}`);

        // Upload audio to GCS - **Update path and content type for WAV**
        const audioPath = `stories/${storyId}/audio/section_${index}.wav`; // Changed extension to .wav
        const audioFile = storage.bucket().file(audioPath);
        logger.info(`[${storyId}] Uploading audio content to ${audioPath}...`);
        await audioFile.save(ttsResponse.audioContent as Buffer, { metadata: { contentType: "audio/wav" } }); // Changed contentType to audio/wav
        await audioFile.makePublic();
        generatedAudioUrl = audioFile.publicUrl(); // Store the URL

        logger.info(`[${storyId}] Audio successfully uploaded for section ${index}. URL: ${generatedAudioUrl}`);
      } catch (error) {
        // **More detailed error logging for TTS**
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[${storyId}] Audio gen/upload failed (sec ${index}): ${errorMessage}`, { error }); // Log the full error object
        await storyRef.update({
          status: "error" as StoryStatus,
          errorMessage: `Audio generation failed (section ${index}): ${errorMessage}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return; // Stop processing
      }

      // --- 5d. Consolidated Section Update (Read-Modify-Write) ---
      try {
        logger.info(`[${storyId}] Updating section ${index} data in Firestore...`);
        const currentDoc = await storyRef.get();
        if (!currentDoc.exists) {
          throw new Error("Document unexpectedly deleted during processing.");
        }
        const currentData = currentDoc.data() as StoryDocument;
        // Ensure sections is treated as an array, create a mutable copy
        const updatedSections = Array.isArray(currentData.sections) ? [...currentData.sections] : [];

        // Check if the index is valid for the array fetched from Firestore
        if (index >= updatedSections.length || !updatedSections[index]) {
          // This indicates a serious inconsistency, as the array should have been
          // initialized with placeholders for all plan items earlier.
          logger.error(`[${storyId}] Consistency Error: Section ${index} is missing or invalid in the 'sections' array read from Firestore. Expected length based on plan: ${plan.length}, Actual length: ${updatedSections.length}.`);
          // Throw an error to halt processing, as the state is unexpected.
          throw new Error(`Inconsistent state: Section ${index} not found in Firestore document.`);
        }

        // Prepare the updated section data
        // Ensure all values are either strings or null, defaulting to null if undefined/empty.
        const updatedSectionData: StorySection = {
          ...updatedSections[index], // Keep existing fields like planItem, index
          text: typeof generatedText === "string" && generatedText.trim() !== "" ? generatedText.trim() : null,
          imageUrl: typeof generatedImageUrl === "string" && generatedImageUrl.trim() !== "" ? generatedImageUrl.trim() : null,
          audioUrl: typeof generatedAudioUrl === "string" && generatedAudioUrl.trim() !== "" ? generatedAudioUrl.trim() : null,
        };

        // **Detailed Logging:** Log the exact object before attempting the update.
        // Use JSON.stringify to handle potential complex objects or undefined values safely in logs.
        // Using logger.debug for potentially verbose output. Ensure your Function log level captures debug messages if needed.
        logger.debug(`[${storyId}] Preparing to update Firestore for section ${index}. Data being assigned: ${JSON.stringify(updatedSectionData, null, 2)}`);

        // Assign the validated & logged data back to the array copy
        updatedSections[index] = updatedSectionData;

        // Log the whole array structure briefly (optional, can be large)
        logger.debug(`[${storyId}] Full sections array structure before update (index ${index}): ${JSON.stringify(updatedSections.map(s => ({ index: s.index, hasText: !!s.text, hasImg: !!s.imageUrl, hasAudio: !!s.audioUrl })), null, 2)}`);


        // Write the entire modified array back to Firestore
        await storyRef.update({
          sections: updatedSections, // Overwrite the entire array with the modified copy
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(`[${storyId}] Successfully updated section ${index} data in Firestore.`);

      } catch (error) {
        // Log the specific error from Firestore
        logger.error(`[${storyId}] Failed updating section ${index} data in Firestore:`, error);
        // Update Firestore with error status (existing logic)
        await storyRef.update({
          status: "error" as StoryStatus,
          errorMessage: `Failed saving section ${index} data: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return; // Stop processing
      }
    } // End of section generation loop

    // --- 6. Final Status Update (Complete) ---
    try {
      logger.info(`[${storyId}] All sections generated. Setting status to 'complete'.`);
      const completeUpdateData: Partial<StoryDocumentWriteData> = {
        status: "complete",
        errorMessage: null, // Clear error on success
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await storyRef.update(completeUpdateData);
      logger.info(`[${storyId}] Generation pipeline finished successfully.`);
    } catch (error) {
      // If this fails, the story might be left in the last 'generating_audio_x' state
      logger.error(`[${storyId}] Failed to update final status to 'complete':`, error);
    }

    return;
  }); // End of generateStoryPipeline

// === NEW: Generate Story Topics Callable Function ===

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params"; // << Import defineString

// Define the structure for topic suggestions
interface TopicSuggestion {
  text: string;
  emojis: string; // String containing 1-2 emojis
}

// Define the secret parameter for the Gemini API Key
const googleGenaiApiKey = defineString("GOOGLE_GENAI_API_KEY");

// Update return type annotation
export const generateTopics = onCall(async (request): Promise<TopicSuggestion[]> => {
  logger.info("generateTopics: Function called");

  // 1. Authentication Check
  if (!request.auth) {
    logger.error("generateTopics: Unauthenticated user.");
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const uid = request.auth.uid;
  logger.info(`generateTopics: Authenticated user: ${uid}`);

  // 2. Fetch User Profile
  let userProfile: UserProfile | null = null;
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      logger.error(`generateTopics: User profile not found for UID: ${uid}`);
      throw new HttpsError("not-found", "User profile not found.");
    }
    userProfile = userDoc.data() as UserProfile;
    logger.info(`generateTopics: Fetched profile for user ${uid}`);
  } catch (error) {
    logger.error(`generateTopics: Error fetching user profile for ${uid}:`, error);
    throw new HttpsError("internal", "Failed to fetch user profile.", error);
  }

  // 3. Initialize Genkit with API Key
  const apiKey = googleGenaiApiKey.value(); // <-- Access the secret value
  if (!apiKey) {
    logger.error("generateTopics: GOOGLE_GENAI_API_KEY secret is not configured.");
    throw new HttpsError("internal", "API key configuration error.");
  }

  const ai = genkit({
    plugins: [
      // Pass the API key to the googleAI plugin
      googleAI({ apiKey: apiKey }),
    ],
  });

  // 4. Construct Updated Prompt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const age = userProfile.birthday ? Math.floor((Date.now() - (userProfile.birthday as any).toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 5; // Example age calculation
  const gender = userProfile.gender || "child"; // Default if gender not set
  // Update prompt to ask for text and emojis in a specific JSON structure
  const prompt = `Suggest 9 simple, creative, and fun story *ideas* or *titles* suitable for a ${age}-year-old ${gender}.
    Each suggestion should be a short phrase (1-6 words) that hints at a story, not just a description. For example, "The adventurous little star" is better than "A little star".
    For each suggestion, provide the text and a string with 1-2 relevant emojis.
    Return the suggestions ONLY as a JSON array of objects, where each object has a "text" key (string) and an "emojis" key (string).
    Example format: [
      {"text": "A talking squirrel's big secret", "emojis": "🐿️🤫"},
      {"text": "The magical paintbrush", "emojis": "🖌️✨"},
      {"text": "The day the crayons quit", "emojis": "🖍️😠"},
      {"text": "Lost in the candy kingdom", "emojis": "🍬👑"}
    ]`;

  logger.info(`generateTopics: Prompting Gemini for user ${uid} (with emojis): ${prompt}`);

  // 5. Generate Topics using Genkit
  try {
    const result = await ai.generate({
      model: gemini20Flash, // Specify the model
      prompt: prompt,
      config: { temperature: 0.8 }, // Adjust temperature for creativity
      output: { format: "json" }, // Request JSON output directly
    });

    const topicsJson = result.text; // Access property directly
    logger.info(`generateTopics: Received raw response for ${uid}: ${topicsJson}`);

    // 6. Parse Updated Response Structure
    try {
      const topics: TopicSuggestion[] = JSON.parse(topicsJson || "[]"); // Parse JSON

      // Validate the structure
      if (!Array.isArray(topics) ||
        !topics.every((t) =>
          typeof t === "object" &&
          t !== null &&
          typeof t.text === "string" &&
          typeof t.emojis === "string"
        )
      ) {
        logger.warn(`generateTopics: Parsed response is not a valid TopicSuggestion array for ${uid}. Raw: ${topicsJson}`);
        // Attempt basic cleanup if it looks like maybe just text was returned
        if (typeof topicsJson === "string") {
          const simpleTopics = topicsJson.split("\n").map((t) => t.trim()).filter(Boolean);
          if (simpleTopics.length > 0) {
            // Return with default/missing emojis if simple text list detected
            return simpleTopics.map((text) => ({ text, emojis: "✨" }));
          }
        } else if (Array.isArray(topics) && topics.every((t) => typeof t === "string")) {
          // Handle case where it returned array of strings instead of objects
          return topics.map((text) => ({ text, emojis: "✨" }));
        }
        throw new Error("Parsed response did not match expected format: [{text: string, emojis: string}].");
      }

      logger.info(`generateTopics: Successfully generated topics for ${uid}:`, topics);
      return topics;
    } catch (parseError) {
      logger.error(`generateTopics: Failed to parse JSON response for ${uid}. Raw: ${topicsJson}`, parseError);
      throw new HttpsError("internal", "Failed to parse AI model response.", parseError);
    }
  } catch (error) {
    logger.error(`generateTopics: Failed to generate topics using Genkit for user ${uid}:`, error);
    throw new HttpsError("internal", "AI topic generation failed.", error);
  }
});
