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
import { googleAI, gemini15Flash } from "@genkit-ai/googleai";
import { vertexAI, imagen3 } from "@genkit-ai/vertexai"; // Import Imagen model

// Import types using the path alias
import { StoryDocument, StoryStatus, StorySection } from "../../types";
import { Character } from "../../types";

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

    logger.info(`[${storyId}] Genkit: Starting pipeline for user ${storyData.userId}...`);

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

    // --- 2. Fetch Character Details (Keep existing logic) ---
    let characters: Character[] = [];
    if (storyData.characterIds && storyData.characterIds.length > 0) {
      try {
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
      } catch (error) {
        logger.error(`[${storyId}] Failed fetching characters:`, error);
        await storyRef.update({
          status: "error" as StoryStatus,
          errorMessage: `Failed fetching characters: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }
    }
    const characterDescriptions = characters.map((c) => `- ${c.name}: ${c.description}`).join("\n");
    const characterDetailsString = characters.map((c) => `${c.name} (${c.description})`).join(", ");


    // --- 3. Generate Title and Plan (using Genkit) ---
    let title = "My Story"; // Default title
    let plan: string[] = [];
    try {
      logger.info(`[${storyId}] Generating title and plan using Genkit Gemini...`);

      // Generate Title
      const titlePrompt = `Create a short, catchy title (3-7 words) for a children's story about "${storyData.topic || "adventure"}". ${characters.length > 0 ? `Characters: ${characterDetailsString}` : ""}. Respond ONLY with the title text.`;
      const titleResult = await ai.generate({
        model: gemini15Flash,
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
        model: gemini15Flash,
        prompt: planPrompt,
        output: { format: "json" }, // Request JSON
        config: { temperature: 0.7 },
      });

      // Genkit handles JSON parsing when format: 'json' is used
      const parsedPlan = planResult.output();
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

    // --- 5. Background Section Generation Loop ---
    let previousText = "The story begins."; // Context for first section
    const STYLE_LOCK = "Children's storybook illustration, simple, friendly, colorful."; // Image style guidance

    for (let index = 0; index < plan.length; index++) {
      const currentPlanItem = plan[index];
      let generatedText: string | null = null;
      const sectionPathPrefix = `sections.${index}`; // For Firestore updates

      // --- 5a. Generate Text ---
      try {
        const textStatus: StoryStatus = `generating_text_${index}`;
        logger.info(`[${storyId}] Updating status to '${textStatus}'`);
        await storyRef.update({ status: textStatus });

        const textPrompt = `Continue the children's story titled "${title}". Scene: "${currentPlanItem}"
Previous part: "${previousText}"
Characters: ${characterDetailsString || "None specified"}
Write 2-4 simple, engaging sentences suitable for a 3-8 year old. Respond ONLY with the text for this section.`;

        const textResult = await ai.generate({
          model: gemini15Flash,
          prompt: textPrompt,
          config: { temperature: 0.7, maxOutputTokens: 256 },
        });
        generatedText = textResult.text?.trim() || null;

        if (!generatedText) throw new Error("Text generation failed (empty content).");

        previousText = generatedText; // Update context for next iteration
        const textUpdateData = {
          [`${sectionPathPrefix}.text`]: generatedText,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Update timestamp
        };
        await storyRef.update(textUpdateData);
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
        await storyRef.update({ status: imageStatus });

        // Use generated text for image prompt
        const imagePrompt = `Children's storybook illustration, ${STYLE_LOCK}. Scene depicting: ${generatedText}. Characters: ${characterDetailsString || "None visible"}.`;

        const imageResult = await ai.generate({
          model: imagen3, // Use Imagen model
          prompt: imagePrompt,
          output: { format: "media" }, // Request media output
          // Add specific Imagen config if needed (e.g., aspectRatio)
          // config: { aspectRatio: "1:1", sampleCount: 1 }
        });

        // Access media directly as a property, checking for null/undefined
        const media = imageResult.media;

        // Check if media object and its url exist
        if (!media || !media.url) {
          throw new Error("Image generation failed (no media URL found).");
        }

        // Use the URL provided by Genkit directly
        const generatedImageUrl = media.url;

        logger.info(`[${storyId}] Image URL obtained for section ${index}: ${generatedImageUrl}`);
        const imageUpdateData = {
          [`${sectionPathPrefix}.imageUrl`]: generatedImageUrl,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await storyRef.update(imageUpdateData);
      } catch (error) {
        logger.error(`[${storyId}] Image gen/upload failed (sec ${index}):`, error);
        await storyRef.update({
          status: "error" as StoryStatus,
          errorMessage: `Image generation failed (section ${index}): ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return; // Stop processing
      }

      // --- 5c. Generate Audio (Keep using TTS Client) ---
      try {
        const audioStatus: StoryStatus = `generating_audio_${index}`;
        logger.info(`[${storyId}] Updating status to '${audioStatus}'`);
        await storyRef.update({ status: audioStatus });

        if (generatedText) {
          const ttsRequest = {
            input: { text: generatedText },
            voice: { languageCode: "en-US", name: "en-US-Standard-C", ssmlGender: "NEUTRAL" as const },
            audioConfig: { audioEncoding: "MP3" as const },
          };

          const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
          if (!ttsResponse.audioContent) throw new Error("TTS returned no audio content.");

          // Upload audio to GCS
          const audioPath = `stories/${storyId}/audio/section_${index}.mp3`;
          const audioFile = storage.bucket().file(audioPath);
          await audioFile.save(ttsResponse.audioContent as Buffer, { metadata: { contentType: "audio/mpeg" } });
          await audioFile.makePublic();
          const generatedAudioUrl = audioFile.publicUrl();

          logger.info(`[${storyId}] Audio uploaded for section ${index}: ${generatedAudioUrl}`);
          const audioUpdateData = {
            [`${sectionPathPrefix}.audioUrl`]: generatedAudioUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          await storyRef.update(audioUpdateData);
        } else {
          logger.warn(`[${storyId}] Skipping audio gen (sec ${index}): missing text.`);
          // Optionally update the section to indicate skipped audio?
          // await storyRef.update({ [`${sectionPathPrefix}.audioUrl`]: 'skipped' });
        }
      } catch (error) {
        logger.error(`[${storyId}] Audio gen/upload failed (sec ${index}):`, error);
        await storyRef.update({
          status: "error" as StoryStatus,
          errorMessage: `Audio generation failed (section ${index}): ${error instanceof Error ? error.message : String(error)}`,
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
import { UserProfile } from "../../types"; // Import UserProfile type
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
  const prompt = `Suggest 8 simple, creative, and fun story topics suitable for a ${age}-year-old ${gender}.
    Topics should be 1-5 words long.
    For each topic, provide the text and a string with 1-2 relevant emojis.
    Return the topics ONLY as a JSON array of objects, where each object has a "text" key (string) and an "emojis" key (string).
    Example: [
      {"text": "A talking squirrel's big secret", "emojis": "🐿️🤫"},
      {"text": "The magical paintbrush", "emojis": "🖌️✨"},
      {"text": "Lost in the candy kingdom", "emojis": "🍬👑"}
    ]`;

  logger.info(`generateTopics: Prompting Gemini for user ${uid} (with emojis): ${prompt}`);

  // 5. Generate Topics using Genkit
  try {
    const result = await ai.generate({
      model: gemini15Flash, // Specify the model
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
