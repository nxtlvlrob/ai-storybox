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

// Import ONLY OpenAI service functions
import {
  generateOpenAICompleteStory,   // NEW function
  generateOpenAITopicSuggestions, // NEW function
  generateOpenAIStorySectionImage, // Updated function
  generateAndUploadOpenAIAudio,
  OPENAI_VOICES
} from "./services/openai"; // Assuming index.ts is the entry point for openai service

// Import types using the path alias - Check this path is correct
import { StoryDocument, StoryStatus, StorySection, UserProfile, TopicSuggestion, StoryLength } from "../../types";

import { Resvg } from "@resvg/resvg-js";
import { URL } from "url"; // Import the URL class from Node.js

// Add import for ElevenLabs TTS service
import { generateAndUploadElevenLabsAudio, ELEVENLABS_VOICES } from "./services/elevenlabs";

// Firebase specific types
export type StoryDocumentWriteData = Omit<StoryDocument, "createdAt" | "updatedAt" | "plan"> & { // Ensure plan is omitted if it was removed
  createdAt: FieldValue | Timestamp;
  updatedAt: FieldValue | Timestamp;
};

// TTS Provider type - Remove Google
export type TTSProvider = /* "google" | */ "elevenlabs" | "openai";

// Initialize Firebase Admin SDK (should be done once)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage(); // Initialize storage for saving audio/images

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

// === Main Cloud Function: Orchestrate Story Generation (Refactored for Section-by-Section Assets) ===

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "1GiB" as const,
};

// Helper function to upload Base64 image data to GCS
async function uploadImageBase64ToGcs(base64String: string, gcsPath: string, storyId: string): Promise<string> {
  try {
    logger.info(`[${storyId}] Uploading base64 image to ${gcsPath}...`);
    const base64Data = base64String.replace(/^data:image\/[^;]+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const mimeMatch = base64String.match(/^data:(image\/[^;]+);base64,/);
    const mimeType = mimeMatch && mimeMatch[1] ? mimeMatch[1] : "image/png";
    
    const imageFile = storage.bucket().file(gcsPath);
    await imageFile.save(imageBuffer, { metadata: { contentType: mimeType } });
    await imageFile.makePublic();
    const publicUrl = imageFile.publicUrl();
    logger.info(`[${storyId}] Image successfully uploaded to GCS. URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    logger.error(`[${storyId}] Failed to upload image to GCS path ${gcsPath}:`, error);
    throw error; // Re-throw to be caught by Promise.allSettled handler
  }
}

export const generateStoryPipeline = onDocumentCreated(
  { document: "stories/{storyId}", ...runtimeOpts },
  async (event): Promise<void> => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data associated with the event");
      return;
    }
    const storyId = event.params.storyId;
    const storyData = snapshot.data() as StoryDocument; // Use let as it might be updated
    const storyRef = snapshot.ref;
    const userId = storyData.userId;

    logger.info(`[${storyId}] Starting story generation pipeline for user ${userId}...`);

    if (storyData.status !== "queued") {
      logger.warn(`[${storyId}] Function triggered for story not in 'queued' state (${storyData.status}). Skipping.`);
      return;
    }

    // --- 1. Update Status to Generating Story --- 
    try {
      logger.info(`[${storyId}] Updating status to 'generating_story'...`);
      await storyRef.update({
        status: "generating_story" as StoryStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: null,
      });
    } catch (error) {
      logger.error(`[${storyId}] Failed to update status to 'generating_story':`, error);
      return;
    }

    // --- 2. Fetch User Profile & Avatar (remains same) ---
    let userProfile: UserProfile | null = null;
    let actualPngBase64: string | null = null;
    try {
      // ... (fetch profile logic remains the same) ...
      logger.info(`[${storyId}] Fetching profile for user ${userId}...`);
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        userProfile = userDoc.data() as UserProfile;
        logger.info(`[${storyId}] User profile fetched.`);
        if (userProfile.avatarUrl) {
          logger.info(`[${storyId}] Found avatarUrl (storage URL): ${userProfile.avatarUrl}`);
          actualPngBase64 = await convertSvgUrlToPngBase64(userProfile.avatarUrl, storyId);
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
    } catch (error) {
      logger.error(`[${storyId}] Failed fetching user profile:`, error);
      await storyRef.update({
        status: "error" as StoryStatus,
        errorMessage: `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const userName = userProfile?.name || "the child";
    const characterDescription = `${userName} (${userProfile?.gender || "child"}) - A curious, adventurous child who loves to explore and discover new things.`;

    // --- 3. Generate Complete Story (Title, Text, Image Briefs) using OpenAI --- 
    let storyResult: { title: string; sections: { text: string; imageBrief: string }[] } | null = null;
    try {
      logger.info(`[${storyId}] Generating complete story with OpenAI...`);
      storyResult = await generateOpenAICompleteStory(
        characterDescription,
        storyData.topic || "adventure",
        storyData.length
      );
      if (!storyResult || !storyResult.title || !storyResult.sections || storyResult.sections.length === 0) {
        throw new Error("OpenAI story generation returned invalid or empty data.");
      }
      logger.info(`[${storyId}] Generated story titled "${storyResult.title}" with ${storyResult.sections.length} sections.`);

      // --- 4. Initial Firestore Update (Title, Text, Briefs, Start Status) ---
      const initialSectionsData: StorySection[] = storyResult.sections.map((genSection, index) => ({
        index,
        text: genSection.text, 
        imageBrief: genSection.imageBrief, 
        imageUrl: null, 
        audioUrl: null, 
      }));
      
      // Determine voice ID (logic remains similar, ensure OPENAI_VOICES is available)
      let storyVoiceId = userProfile?.voiceId;
      if (!storyVoiceId || !(storyVoiceId in OPENAI_VOICES)) {
        const defaultVoiceKey = storyData.gender === "male" ? "MALE_CHILD" : "FEMALE_CHILD"; 
        storyVoiceId = OPENAI_VOICES[defaultVoiceKey];
        logger.warn(`[${storyId}] User profile voiceId '${userProfile?.voiceId}' is invalid or missing. Defaulting to ${defaultVoiceKey} ('${storyVoiceId}').`);
      } else {
        storyVoiceId = OPENAI_VOICES[storyVoiceId as keyof typeof OPENAI_VOICES] ?? OPENAI_VOICES.FEMALE_CHILD;
      }
      logger.info(`[${storyId}] Selected OpenAI voiceId for story: ${storyVoiceId}`);

      const initialUpdateData: Partial<StoryDocumentWriteData> = {
        title: storyResult.title,
        sections: initialSectionsData, 
        status: "generating_assets_0", // Start asset generation for the first section
        voiceId: storyVoiceId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: null,
      };
      await storyRef.update(initialUpdateData);
      logger.info(`[${storyId}] Initial story structure saved. Status: 'generating_assets_0'.`);

    } catch (error) {
      logger.error(`[${storyId}] Failed generating complete story:`, error);
      await storyRef.update({
        status: "error" as StoryStatus,
        errorMessage: `Failed generating story: ${error instanceof Error ? error.message : String(error)}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    // --- 5. Background Section Asset Generation Loop (Image & Audio Concurrently) ---
    const sectionsToProcess = storyResult.sections;
    
    for (let index = 0; index < sectionsToProcess.length; index++) {
      const currentSectionData = sectionsToProcess[index];
      const statusUpdate: StoryStatus = `generating_assets_${index}`; 

      logger.info(`[${storyId}] Starting asset generation for section ${index}. Updating status to '${statusUpdate}'.`);
      try {
        // Update status for the current section *before* starting generation
        await storyRef.update({ status: statusUpdate, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      } catch (statusError) {
        logger.error(`[${storyId}] Failed to update status to '${statusUpdate}' before processing section ${index}:`, statusError);
        // Decide whether to proceed or halt; halting is safer.
        await storyRef.update({ 
          status: "error", 
          errorMessage: `Failed setting status for section ${index}: ${statusError instanceof Error ? statusError.message : String(statusError)}`, 
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        });
        return; // Stop processing
      }
      
      // Define promises for image and audio generation
      const imagePromise = (async () => {
        if (!currentSectionData.imageBrief) {
          logger.warn(`[${storyId}] Section ${index}: Skipping image generation due to missing imageBrief.`);
          return null; // Return null if no brief
        }
        const imgStartTime = Date.now(); // Start image timer
        try {
          logger.info(`[${storyId}] Section ${index}: Generating image...`);
          const imageBase64 = await generateOpenAIStorySectionImage(
            characterDescription,
            currentSectionData.imageBrief
          );
          if (!imageBase64) throw new Error("generateOpenAIStorySectionImage returned null or empty.");
          
          const imagePath = `stories/${storyId}/images/section_${index}.png`; // Assuming png
          const imageUrl = await uploadImageBase64ToGcs(imageBase64, imagePath, storyId);
          const imgEndTime = Date.now(); // End image timer
          logger.info(`[${storyId}] Section ${index}: Image generation and upload took ${imgEndTime - imgStartTime} ms.`); // Log duration
          return imageUrl;
        } catch (imgError) {
          const imgEndTime = Date.now(); // End image timer on error
          logger.error(`[${storyId}] Section ${index}: Image generation/upload failed after ${imgEndTime - imgStartTime} ms:`, imgError);
          throw imgError; // Propagate error to Promise.allSettled
        }
      })();

      const audioPromise = (async () => {
        if (!currentSectionData.text) {
          logger.warn(`[${storyId}] Section ${index}: Skipping audio generation due to missing text.`);
          return null; // Return null if no text
        }
        const audioStartTime = Date.now(); // Start audio timer
        try {
          logger.info(`[${storyId}] Section ${index}: Generating audio...`);
          // Re-fetch storyData to get potentially updated ttsProvider/voiceId if needed, or use initial one
          const currentStoryDoc = await storyRef.get(); // Fetch latest doc state
          const latestStoryData = currentStoryDoc.data() as StoryDocument;
          const ttsProvider: TTSProvider = latestStoryData.ttsProvider || "openai";
          const audioPath = `stories/${storyId}/audio/section_${index}.mp3`;
          const textToSpeak = currentSectionData.text;
          let audioUrl: string | null = null;

          if (ttsProvider === "elevenlabs") {
            const elevenLabsVoiceId = latestStoryData.gender === "male" ? ELEVENLABS_VOICES.MALE_CHILD : ELEVENLABS_VOICES.FEMALE_CHILD;
            audioUrl = await generateAndUploadElevenLabsAudio(textToSpeak, audioPath, { voiceId: elevenLabsVoiceId });
          } else { // Default to OpenAI
            const voice = latestStoryData.voiceId || OPENAI_VOICES.FEMALE_CHILD;
            audioUrl = await generateAndUploadOpenAIAudio(textToSpeak, audioPath, { voice });
          }
          const audioEndTime = Date.now(); // End audio timer
          logger.info(`[${storyId}] Section ${index}: Audio generation and upload (${ttsProvider}) took ${audioEndTime - audioStartTime} ms.`); // Log duration
          return audioUrl;
        } catch (audioError) {
          const audioEndTime = Date.now(); // End audio timer on error
          // Read provider again for logging if needed, or just log the error
          const currentStoryDoc = await storyRef.get(); 
          const latestStoryData = currentStoryDoc.data() as StoryDocument;
          const ttsProviderOnError: TTSProvider = latestStoryData.ttsProvider || "openai";
          logger.error(`[${storyId}] Section ${index}: Audio generation/upload (${ttsProviderOnError}) failed after ${audioEndTime - audioStartTime} ms:`, audioError);
          throw audioError;
        }
      })();

      // Await both promises concurrently
      logger.info(`[${storyId}] Section ${index}: Awaiting concurrent image and audio generation...`);
      const results = await Promise.allSettled([imagePromise, audioPromise]);
      logger.info(`[${storyId}] Section ${index}: Concurrent generation finished.`);

      const imageResult = results[0];
      const audioResult = results[1];

      let finalImageUrl: string | null = null;
      let finalAudioUrl: string | null = null;
      let sectionError: string | null = null;

      if (imageResult.status === "fulfilled") {
        finalImageUrl = imageResult.value;
        logger.info(`[${storyId}] Section ${index}: Image promise fulfilled. URL: ${finalImageUrl}`);
      } else {
        sectionError = `Image generation failed: ${imageResult.reason instanceof Error ? imageResult.reason.message : String(imageResult.reason)}`;
        logger.error(`[${storyId}] Section ${index}: Image promise rejected. Reason:`, imageResult.reason);
      }

      if (audioResult.status === "fulfilled") {
        finalAudioUrl = audioResult.value;
        logger.info(`[${storyId}] Section ${index}: Audio promise fulfilled. URL: ${finalAudioUrl}`);
      } else {
        const audioErrorMsg = `Audio generation failed: ${audioResult.reason instanceof Error ? audioResult.reason.message : String(audioResult.reason)}`;
        sectionError = sectionError ? `${sectionError}; ${audioErrorMsg}` : audioErrorMsg;
        logger.error(`[${storyId}] Section ${index}: Audio promise rejected. Reason:`, audioResult.reason);
      }

      // Update Firestore for this section using Read-Modify-Write
      try {
        logger.info(`[${storyId}] Section ${index}: Updating Firestore with asset URLs...`);
        const currentDoc = await storyRef.get();
        if (!currentDoc.exists) {
          throw new Error("Document unexpectedly deleted during processing.");
        }
        const currentStoryData = currentDoc.data() as StoryDocument;
        const updatedSections = Array.isArray(currentStoryData.sections) ? [...currentStoryData.sections] : [];

        if (index < updatedSections.length && updatedSections[index]) {
          updatedSections[index] = {
            ...updatedSections[index],
            imageUrl: finalImageUrl, // Update with generated URL or null
            audioUrl: finalAudioUrl, // Update with generated URL or null
          };
            
          // Prepare update data
          const sectionUpdateData: Partial<StoryDocumentWriteData> = {
            sections: updatedSections,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
            
          // If a partial error occurred during asset generation, store it but don't halt yet
          if (sectionError && !currentStoryData.errorMessage) { // Only update error if not already set
            sectionUpdateData.errorMessage = `Section ${index} partial error: ${sectionError}`; 
            logger.warn(`[${storyId}] Section ${index}: Partial asset generation error stored: ${sectionError}`);
          }

          await storyRef.update(sectionUpdateData);
          logger.info(`[${storyId}] Section ${index}: Firestore updated successfully.`);
        } else {
          logger.error(`[${storyId}] Section ${index}: Consistency error - Section index out of bounds in Firestore data.`);
          // Handle this inconsistency - perhaps halt with error
          throw new Error(`Firestore consistency error for section ${index}.`);
        }
      } catch (updateError) {
        logger.error(`[${storyId}] Section ${index}: Failed updating Firestore:`, updateError);
        // Halt processing on Firestore update failure
        await storyRef.update({ 
          status: "error", 
          errorMessage: `Failed saving assets for section ${index}: ${updateError instanceof Error ? updateError.message : String(updateError)}`, 
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        });
        return; 
      }
      
      // Optional: If a partial error occurred, maybe halt the process?
      // Current logic allows continuing and just storing the partial error message.
      // To halt on partial error, uncomment below:
      /*
      if (sectionError) {
          logger.error(`[${storyId}] Halting process due to partial error in section ${index}.`);
          await storyRef.update({ 
              status: "error", 
              // Error message already set in the update above
              updatedAt: admin.firestore.FieldValue.serverTimestamp() 
          });
          return;
      }
      */

    } // End of section processing loop

    // --- 6. Final Status Update (Complete) --- 
    try {
      // Check if the story ended with a partial error from the last section update
      const finalDoc = await storyRef.get();
      const finalData = finalDoc.data() as StoryDocument;
      if (finalData.status.startsWith("generating_assets_")) { // Only update if still in generating state
        logger.info(`[${storyId}] All sections processed. Setting status to 'complete'.`);
        const completeUpdateData: Partial<StoryDocumentWriteData> = {
          status: "complete",
          // Keep potential errorMessage from partial failures
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await storyRef.update(completeUpdateData);
        logger.info(`[${storyId}] Generation pipeline finished.`);
      } else { 
        logger.warn(`[${storyId}] Final status update skipped as status was already '${finalData.status}'.`);
      }
    } catch (error) {
      logger.error(`[${storyId}] Failed to update final status to 'complete':`, error);
      // Story might be left in 'generating_assets_X' or 'error' state here
    }

    return;
  }); // End of generateStoryPipeline

// === Generate Story Topics Callable Function (Remains the same) ===

// Keep TopicSuggestion interface import

export const generateTopics = onCall(async (request): Promise<TopicSuggestion[]> => {
  logger.info("generateTopics: Function called");

  // 1. Authentication Check (remains the same)
  if (!request.auth) {
    logger.error("generateTopics: Unauthenticated user.");
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const uid = request.auth.uid;
  logger.info(`generateTopics: Authenticated user: ${uid}`);

  // 2. Fetch User Profile (remains the same)
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

  // 3. Get age and gender from profile (remains the same)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const age = userProfile.birthday ? Math.floor((Date.now() - (userProfile.birthday as any).toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 5;
  const gender = userProfile.gender || "child";

  // 4. Generate Topics using OpenAI service function
  try {
    logger.info(`generateTopics: Prompting OpenAI for user ${uid}`);
    // Call the new OpenAI topic suggestion function
    const topicsResult = await generateOpenAITopicSuggestions(age, gender);

    // Result should already be TopicSuggestion[] if successful
    if (Array.isArray(topicsResult) && topicsResult.length > 0) {
      logger.info(`generateTopics: Successfully generated topics for ${uid}:`, topicsResult);
      return topicsResult;
    } else {
      // Handle potential empty array or unexpected result
      logger.warn(`generateTopics: OpenAI service returned unexpected result for ${uid}. Result:`, topicsResult);
      throw new Error("AI model did not return valid topic suggestions.");
    }
  } catch (error) {
    logger.error(`generateTopics: Failed to generate topics for user ${uid}:`, error);
    throw new HttpsError("internal", "AI topic generation failed.", error);
  }
});

// === Test AI Services Function (Remains mostly the same, maybe update tasks) ===
export const testAIServices = onCall(async (request) => {
  // 1. Authentication Check (remains the same)
  if (!request.auth) {
    logger.error("testAIServices: Unauthenticated user.");
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const uid = request.auth.uid;
  logger.info(`testAIServices: Authenticated user: ${uid}`);

  // Get test parameters from request
  const { 
    // service = "openai", // Service is always OpenAI now
    task = "story", // Default task is now 'story'
    characters,
    topic,
    length = "short", // Add length for story test
    // sectionIndex = 0, // No longer needed
    // planItem, // No longer needed
    imageBrief, // Need brief for image test
    textToSpeak, // Need text for TTS test
    gender = "male", 
    ttsProvider = "openai"
  } = request.data || {};

  // Validate parameters
  if (!characters) throw new HttpsError("invalid-argument", "Missing 'characters' parameter");
  if (!topic && task === "story") throw new HttpsError("invalid-argument", "Missing 'topic' parameter for story task");
  if (!imageBrief && task === "image") throw new HttpsError("invalid-argument", "Missing 'imageBrief' parameter for image task");
  if (!textToSpeak && task === "tts") throw new HttpsError("invalid-argument", "Missing 'textToSpeak' parameter for TTS task");

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    const service = "openai"; // Hardcoded

    // Variables used within switch cases
    let testPath: string;
    let voice: string;
    let voiceId: string;

    logger.info(`Testing OpenAI service for task: ${task}`);

    switch (task) {
    case "story": // New task: generate complete story
      result = await generateOpenAICompleteStory(characters, topic, length as StoryLength);
      break;
    case "image": // Updated: uses imageBrief
      result = await generateOpenAIStorySectionImage(characters, imageBrief);
      break;
    case "tts": // TTS logic remains similar, but uses defined providers
      testPath = `test/${uid}/${new Date().getTime()}.mp3`;
      if (ttsProvider === "elevenlabs") {
        voiceId = gender === "male" ? ELEVENLABS_VOICES.MALE_CHILD : ELEVENLABS_VOICES.FEMALE_CHILD;
        result = await generateAndUploadElevenLabsAudio(textToSpeak, testPath, { voiceId });
      } else { // Default to OpenAI TTS
        voice = gender === "male" ? OPENAI_VOICES.MALE_CHILD : OPENAI_VOICES.FEMALE_CHILD;
        result = await generateAndUploadOpenAIAudio(textToSpeak, testPath, { voice });
      }
      break;
    case "topics": // New task: generate topics
      // Use dummy age/gender if not provided in request data for testing
      // eslint-disable-next-line no-case-declarations
      const testAge = request.data?.age || 5;
      // eslint-disable-next-line no-case-declarations
      const testGender = request.data?.gender || "child";
      result = await generateOpenAITopicSuggestions(testAge, testGender);
      break;
    default:
      throw new HttpsError("invalid-argument", `Unknown task for OpenAI: ${task}`);
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
    logger.error(`AI service test failed for openai/${task}:`, error);
    throw new HttpsError(
      "internal",
      `OpenAI service test failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
});
