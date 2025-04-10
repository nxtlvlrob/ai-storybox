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
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";

// Import Google Cloud AI Platform and TTS clients
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

// Import Gemini service functions
import {
  generateStoryTitle,
  generateStoryPlan,
  generateStorySectionText,
  generateStorySectionImage,
  generate
} from "./services/gemini";

// Import OpenAI service functions
import {
  generateOpenAIStoryTitle,
  generateOpenAIStoryPlan,
  generateOpenAIStorySectionText,
  generateOpenAIStorySectionImage,
  generateAndUploadOpenAIAudio,
  OPENAI_VOICES
} from "./services/openai";

// Import types using the path alias
import { StoryDocument, StoryStatus, StorySection, UserProfile } from "../../types";

import { Resvg } from "@resvg/resvg-js";
import { URL } from "url"; // Import the URL class from Node.js

// Add import for ElevenLabs TTS service
import { generateAndUploadElevenLabsAudio, ELEVENLABS_VOICES } from "./services/elevenlabs";

// Firebase specific types
export type StoryDocumentWriteData = Omit<StoryDocument, "createdAt" | "updatedAt"> & {
  createdAt: FieldValue | Timestamp;
  updatedAt: FieldValue | Timestamp;
};

// TTS Provider type
export type TTSProvider = "google" | "elevenlabs" | "openai";

// Define the secret parameter for the Gemini API Key
const googleGenaiApiKey = defineString("GOOGLE_GENAI_API_KEY");

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

    logger.info(`[${storyId}] Starting story generation pipeline for user ${userId}...`);

    // Check initial status (Should be 'queued', set by UI)
    if (storyData.status !== "queued") {
      logger.warn(`[${storyId}] Function triggered for story not in 'queued' state (${storyData.status}). Skipping.`);
      return;
    }

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

    // --- 2. Fetch User Profile ---
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

      // Note: Character fetching is removed as character functionality is not available yet
    } catch (error) {
      logger.error(`[${storyId}] Failed fetching user profile:`, error);
      await storyRef.update({
        status: "error" as StoryStatus,
        errorMessage: `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    // Include user's name in the story if available
    const userName = userProfile?.name || "the child";
    const userDescription = "A curious, adventurous child who loves to explore and discover new things.";

    // User for visual descriptions
    // const userVisualDescription = `Main character ${userName}: ${userDescription}`;

    // --- 3. Generate Title and Plan using our helper functions ---
    let title = "My Story"; // Default title
    let plan: string[] = [];
    try {
      logger.info(`[${storyId}] Generating title and plan...`);

      // Generate Title using our helper function
      title = await generateStoryTitle(
        `${userName} (${userDescription})`,
        storyData.topic || "adventure"
      );
      logger.info(`[${storyId}] Generated title: "${title}"`);

      // Generate Plan using our helper function
      plan = await generateStoryPlan(
        `${userName} (${userDescription})`,
        storyData.topic || "adventure",
        storyData.length
      );

      if (plan.length === 0) {
        throw new Error("Generated plan was empty.");
      }
      logger.info(`[${storyId}] Generated plan with ${plan.length} sections.`);

      // --- 4. Immediate Firestore Update (Title, Plan, Initial Sections) ---
      const initialSectionsData: StorySection[] = Array.isArray(plan) ? plan.map((planItem, index) => ({
        index,
        planItem,
        text: null,
        imageUrl: null,
        audioUrl: null,
      })) : [];
      const firstStatus: StoryStatus = "generating_text_0"; // Start background generation
      
      // Determine voice to use for the whole story based on user profile
      const validOpenAIVoices = ["ballad", "echo", "fable", "onyx", "nova", "shimmer"];
      let storyVoiceId = userProfile?.voiceId;
      if (!storyVoiceId || !validOpenAIVoices.includes(storyVoiceId)) {
        logger.warn(`[${storyId}] User profile voiceId '${storyVoiceId}' is invalid or missing. Defaulting to 'ballad'.`);
        storyVoiceId = "ballad"; // Default voice
      }
      logger.info(`[${storyId}] Selected voiceId for story: ${storyVoiceId}`);
      
      const initialUpdateData: Partial<StoryDocumentWriteData> = {
        title,
        plan,
        sections: initialSectionsData,
        status: firstStatus,
        voiceId: storyVoiceId, // <-- Save the determined voice ID
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: null, // Clear any previous error
      };
      await storyRef.update(initialUpdateData);
      logger.info(`[${storyId}] Initial story structure saved. Status: '${firstStatus}'. Voice: ${storyVoiceId}`);
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
    let cumulativeStoryText = ""; // Initialize cumulative text string
    let previousSectionImageBase64: string | null = null; // Initialize previous image context

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

        // Generate section text using our helper function, passing previous context
        generatedText = await generateStorySectionText(
          `${userName} (${userDescription})`,
          storyData.topic || "adventure",
          currentPlanItem,
          index,
          plan.length,
          cumulativeStoryText // Pass the text from previous sections
        );

        if (!generatedText) throw new Error("Text generation failed (empty content).");

        // Append the newly generated text for the next iteration
        cumulativeStoryText += generatedText + "\n\n"; // Add spacing between sections

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
      let currentSectionImageBase64: string | null = null; // To store the base64 result for the next iteration

      try {
        const imageStatus: StoryStatus = `generating_image_${index}`;
        logger.info(`[${storyId}] Updating status to '${imageStatus}'`);
        await storyRef.update({ status: imageStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        // Generate image using our helper function, passing previous image data
        // It now ALWAYS returns a base64 data URI string
        currentSectionImageBase64 = await generateStorySectionImage(
          `${userName} (${userDescription})`,
          currentPlanItem,
          generatedText, // Text must be non-null here from step 5a
          actualPngBase64, // User character avatar (constant)
          previousSectionImageBase64 // Image from the previous section
        );

        logger.info(`[${storyId}] Received base64 image data for section ${index}. Length: ${currentSectionImageBase64.length}`);

        // Always upload the returned base64 data to GCS
        logger.info(`[${storyId}] Uploading generated image to GCS for section ${index}...`);

        // Extract base64 data (remove data URI prefix)
        const base64Data = currentSectionImageBase64.replace(/^data:image\/[^;]+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");

        // Determine mime type from data URI if possible, default to png
        const mimeMatch = currentSectionImageBase64.match(/^data:(image\/[^;]+);base64,/);
        const mimeType = mimeMatch && mimeMatch[1] ? mimeMatch[1] : "image/png";
        const fileExtension = mimeType === "image/jpeg" ? "jpg" : "png";

        // Define GCS path
        const imagePath = `stories/${storyId}/images/section_${index}.${fileExtension}`;
        const imageFile = storage.bucket().file(imagePath);

        // Upload the image buffer to GCS
        await imageFile.save(imageBuffer, { metadata: { contentType: mimeType } });
        await imageFile.makePublic();
        generatedImageUrl = imageFile.publicUrl(); // Store the GCS URL for Firestore

        logger.info(`[${storyId}] Image successfully uploaded for section ${index}. URL: ${generatedImageUrl}`);

        // Update previous image context for the *next* iteration
        previousSectionImageBase64 = currentSectionImageBase64;

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
        
        // Get TTS provider from story data or default to Google
        const ttsProvider: TTSProvider = storyData.ttsProvider || "openai";
        logger.info(`[${storyId}] Using TTS provider: ${ttsProvider} for section ${index}`);
        
        if (ttsProvider === "elevenlabs") {
          // Use ElevenLabs TTS
          const audioPath = `stories/${storyId}/audio/section_${index}.mp3`;
          logger.info(`[${storyId}] Generating audio with ElevenLabs for section ${index}...`);
          
          // Use child voice based on story context
          const voiceId = storyData.gender === "male" ? 
            ELEVENLABS_VOICES.MALE_CHILD : 
            ELEVENLABS_VOICES.FEMALE_CHILD;
          
          generatedAudioUrl = await generateAndUploadElevenLabsAudio(
            generatedText,
            audioPath,
            {
              voiceId,
              stability: 0.6,
              similarityBoost: 0.75
            }
          );
          
          logger.info(`[${storyId}] ElevenLabs audio successfully generated and uploaded for section ${index}. URL: ${generatedAudioUrl}`);
        } else if (ttsProvider === "openai") {
          // Use OpenAI TTS
          const audioPath = `stories/${storyId}/audio/section_${index}.mp3`;
          logger.info(`[${storyId}] Generating audio with OpenAI for section ${index}...`);
          
          // --- Use the voiceId stored in the StoryDocument --- 
          // Read from storyData which should have been set in step 4
          const voice = storyData.voiceId || "ballad"; // Default to ballad if somehow missing (Use double quotes)
          logger.info(`[${storyId}] Using OpenAI voice: ${voice}`);
          
          generatedAudioUrl = await generateAndUploadOpenAIAudio(
            generatedText,
            audioPath,
            {
              voice, // Pass the selected voice
              speed: 0.25
            }
          );
          
          logger.info(`[${storyId}] OpenAI audio successfully generated and uploaded for section ${index}. URL: ${generatedAudioUrl}`);
        } else {
          // Use Google TTS (default)
          // **Updated TTS Request Configuration**
          const ttsRequest = {
            input: { text: generatedText },
            // Updated Voice selection based on gender
            voice: {
              languageCode: "en-US",
              name: storyData.gender === "male" ? 
                "en-US-Journey-D" : // Male child-friendly voice
                "en-US-Chirp-F",    // Female child-friendly voice
            },
            // Updated Audio Configuration
            audioConfig: {
              audioEncoding: "MP3" as const,
              effectsProfileId: ["small-bluetooth-speaker-class-device"],
              pitch: 0,
              speakingRate: 1,
            },
          };
          logger.info(`[${storyId}] Sending TTS request for section ${index} with config: ${JSON.stringify(ttsRequest)}`);

          const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
          if (!ttsResponse.audioContent) throw new Error("TTS returned no audio content.");
          logger.info(`[${storyId}] TTS response received for section ${index}. Content length: ${ttsResponse.audioContent.length}`);

          // Upload audio to GCS
          const audioPath = `stories/${storyId}/audio/section_${index}.mp3`;
          const audioFile = storage.bucket().file(audioPath);
          logger.info(`[${storyId}] Uploading audio content to ${audioPath}...`);
          await audioFile.save(ttsResponse.audioContent as Buffer, { metadata: { contentType: "audio/mpeg" } });
          await audioFile.makePublic();
          generatedAudioUrl = audioFile.publicUrl(); // Store the URL

          logger.info(`[${storyId}] Audio successfully uploaded for section ${index}. URL: ${generatedAudioUrl}`);
        }
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
        logger.debug(`[${storyId}] Preparing to update Firestore for section ${index}. Data being assigned: ${JSON.stringify(updatedSectionData, null, 2)}`);

        // Assign the validated & logged data back to the array copy
        updatedSections[index] = updatedSectionData;

        // Log the whole array structure briefly (optional, can be large)
        // Add null check for updatedSections before mapping
        if (Array.isArray(updatedSections)) {
          logger.debug(`[${storyId}] Full sections array structure before update (index ${index}): ${JSON.stringify(updatedSections.map(s => s ? {
            index: s.index,
            hasText: !!s.text,
            hasImg: !!s.imageUrl,
            hasAudio: !!s.audioUrl
          } : null), null, 2)}`);
        }

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

import { buildTopicSuggestionsPrompt } from "./prompts";

// Define the structure for topic suggestions
interface TopicSuggestion {
  text: string;
  emojis: string; // String containing 1-2 emojis
}

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

  // 3. Get API Key from the top-level definition
  const apiKey = googleGenaiApiKey.value();
  if (!apiKey) {
    logger.error("generateTopics: GOOGLE_GENAI_API_KEY secret is not configured.");
    throw new HttpsError("internal", "API key configuration error.");
  }

  // 4. Get age and gender from profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const age = userProfile.birthday ? Math.floor((Date.now() - (userProfile.birthday as any).toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 5; // Example age calculation
  const gender = userProfile.gender || "child"; // Default if gender not set

  // Build prompt using our prompt builder function
  const prompt = buildTopicSuggestionsPrompt(age, gender);
  logger.info(`generateTopics: Prompting Gemini for user ${uid}`);

  // 5. Generate Topics using our helper function
  try {
    // Use our service's generate function with JSON output format
    const topicsResult = await generate({
      prompt,
      config: {
        apiKey,
        temperature: 0.8
      },
      outputFormat: "json"
    });

    logger.info(`generateTopics: Received response for ${uid}`);

    // 6. Process the result
    // Since we're using our generate function with JSON output, we should get a parsed object
    if (Array.isArray(topicsResult)) {
      const topics = topicsResult as TopicSuggestion[];

      // Validate the structure
      if (!topics.every((t) =>
        typeof t === "object" &&
        t !== null &&
        typeof t.text === "string" &&
        typeof t.emojis === "string"
      )) {
        logger.warn(`generateTopics: Response is not a valid TopicSuggestion array for ${uid}.`);
        // Attempt basic cleanup
        const validTopics = topics
          .filter(t => t && typeof t === "object")
          .map(t => ({
            text: typeof t.text === "string" ? t.text : String(t.text || "Magical adventure"),
            emojis: typeof t.emojis === "string" ? t.emojis : "✨"
          }));

        if (validTopics.length > 0) {
          return validTopics;
        }
        throw new Error("Response did not match expected format.");
      }

      logger.info(`generateTopics: Successfully generated topics for ${uid}:`, topics);
      return topics;
    } else {
      logger.error(`generateTopics: Response was not an array for ${uid}.`);
      throw new HttpsError("internal", "AI model did not return an array response.");
    }
  } catch (error) {
    logger.error(`generateTopics: Failed to generate topics for user ${uid}:`, error);
    throw new HttpsError("internal", "AI topic generation failed.", error);
  }
});

// === NEW: Test AI Services Function ===
export const testAIServices = onCall(async (request) => {
  // 1. Authentication Check
  if (!request.auth) {
    logger.error("testAIServices: Unauthenticated user.");
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const uid = request.auth.uid;
  logger.info(`testAIServices: Authenticated user: ${uid}`);

  // Get test parameters from request
  const { 
    service = "openai", 
    task = "title", 
    characters, 
    topic, 
    sectionIndex = 0, 
    planItem, 
    previousText = "", 
    gender = "male", 
    ttsProvider = "openai" 
  } = request.data || {};

  // Validate parameters
  if (!characters) {
    throw new HttpsError("invalid-argument", "Missing 'characters' parameter");
  }
  if (!topic) {
    throw new HttpsError("invalid-argument", "Missing 'topic' parameter");
  }

  try {
    // Choose which service to use based on the request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;

    // Variables used within switch cases
    let testText: string;
    let textToSpeak: string;
    let testPath: string;
    let voice: string;
    let voiceId: string;

    if (service === "openai") {
      logger.info(`Testing OpenAI service for task: ${task}`);

      switch (task) {
      case "title":
        result = await generateOpenAIStoryTitle(characters, topic);
        break;
      case "plan":
        result = await generateOpenAIStoryPlan(characters, topic, "medium");
        break;
      case "text":
        if (!planItem) {
          throw new HttpsError("invalid-argument", "Missing 'planItem' parameter for text generation");
        }
        result = await generateOpenAIStorySectionText(
          characters,
          topic,
          planItem,
          sectionIndex,
          3, // Assume 3 sections for testing
          previousText
        );
        break;
      case "image":
        if (!planItem) {
          throw new HttpsError("invalid-argument", "Missing 'planItem' parameter for image generation");
        }
        // For testing, we need some text content
        testText = previousText || "This is a test section about a character on an adventure.";
        result = await generateOpenAIStorySectionImage(characters, planItem, testText);
        break;
      case "tts":
        if (!previousText && !planItem) {
          throw new HttpsError("invalid-argument", "Missing 'text' parameter for TTS generation");
        }
        // Use either provided text or generate a placeholder
        textToSpeak = previousText || "This is a test of text to speech capabilities.";
        // Create a temporary storage path for testing
        testPath = `test/${uid}/${new Date().getTime()}.mp3`;
        
        // Choose TTS provider based on parameter
        if (ttsProvider === "openai") {
          // Get voice based on gender parameter
          voice = gender === "male" ? OPENAI_VOICES.MALE_CHILD : OPENAI_VOICES.FEMALE_CHILD;
          result = await generateAndUploadOpenAIAudio(
            textToSpeak,
            testPath,
            { voice }
          );
        } else if (ttsProvider === "elevenlabs") {
          // Get voice based on gender parameter
          voiceId = gender === "male" ? ELEVENLABS_VOICES.MALE_CHILD : ELEVENLABS_VOICES.FEMALE_CHILD;
          result = await generateAndUploadElevenLabsAudio(
            textToSpeak,
            testPath,
            { voiceId }
          );
        } else {
          // Use Google TTS (default)
          const ttsClient = new TextToSpeechClient();
          const ttsRequest = {
            input: { text: textToSpeak },
            voice: {
              languageCode: "en-US",
              name: gender === "male" ? "en-US-Journey-D" : "en-US-Chirp-F",
            },
            audioConfig: {
              audioEncoding: "MP3" as const,
              pitch: 0,
              speakingRate: 1,
            },
          };
          const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
          if (!ttsResponse.audioContent) throw new Error("TTS returned no audio content.");
          
          // Upload to Firebase Storage
          const storage = admin.storage();
          const audioFile = storage.bucket().file(testPath);
          await audioFile.save(ttsResponse.audioContent as Buffer, { 
            metadata: { contentType: "audio/mpeg" } 
          });
          await audioFile.makePublic();
          result = audioFile.publicUrl();
        }
        break;
      default:
        throw new HttpsError("invalid-argument", `Unknown task: ${task}`);
      }
    } else {
      // Default to Gemini
      logger.info(`Testing Gemini service for task: ${task}`);

      switch (task) {
      case "title":
        result = await generateStoryTitle(characters, topic);
        break;
      case "plan":
        result = await generateStoryPlan(characters, topic, "medium");
        break;
      case "text":
        if (!planItem) {
          throw new HttpsError("invalid-argument", "Missing 'planItem' parameter for text generation");
        }
        result = await generateStorySectionText(
          characters,
          topic,
          planItem,
          sectionIndex,
          3, // Assume 3 sections for testing
          previousText
        );
        break;
      case "image":
        if (!planItem) {
          throw new HttpsError("invalid-argument", "Missing 'planItem' parameter for image generation");
        }
        // For testing, we need some text content
        // eslint-disable-next-line no-case-declarations
        const testText = previousText || "This is a test section about a character on an adventure.";
        result = await generateStorySectionImage(characters, planItem, testText);
        break;
      default:
        throw new HttpsError("invalid-argument", `Unknown task: ${task}`);
      }
    }

    logger.info(`AI service test completed successfully for ${service}/${task}`);
    return {
      service,
      task,
      result,
      success: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`AI service test failed for ${service}/${task}:`, error);
    throw new HttpsError(
      "internal",
      `AI service test failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
});
