/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {EventContext} from "firebase-functions";
import {QueryDocumentSnapshot, DocumentSnapshot} from "firebase-admin/firestore";
import OpenAI from "openai";

// Import types from the shared workspace package
import { StoryDocument, StoryDocumentWriteData, StorySection, StoryStatus, Character, StoryLength } from "@aistorytime/types";

// Initialize Firebase Admin SDK (should be done once)
// Functions environment automatically initializes, but explicit init is safe
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage(); // Initialize admin storage

// --- Environment Variables / Secrets --- 
// Access API keys securely using Firebase Functions configuration or Secret Manager
// Example using environment config (set using firebase functions:config:set)
// const OPENAI_API_KEY = functions.config().openai?.key;
// Example using Secret Manager (recommended for production)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; 
// Define the secret in Cloud Secret Manager and grant access to the function's service account
// functions.runWith({ secrets: ["OPENAI_API_KEY"] })

if (!OPENAI_API_KEY) {
  logger.error("OpenAI API key is not set. Function cannot proceed.");
  // Optionally throw an error during initialization to prevent deployment/execution
  // throw new Error("Missing OPENAI_API_KEY environment variable or secret");
}

// Initialize OpenAI client (only if key is available)
const openai = OPENAI_API_KEY ? new OpenAI({apiKey: OPENAI_API_KEY}) : null;

// === Main Cloud Function: Orchestrate Story Generation ===

// Increase timeout to maximum (9 minutes) for the long generation process
export const generateStoryPipeline = functions.runWith({timeoutSeconds: 540, secrets: ["OPENAI_API_KEY"]}).firestore
    .document("stories/{storyId}")
    .onCreate(async (snapshot: QueryDocumentSnapshot, context: EventContext): Promise<void> => {
      // Ensure OpenAI client is available
      if (!openai) {
          logger.error("OpenAI client not initialized due to missing API key.");
          // Update status to error directly? Might be problematic if onCreate triggers again
          // For now, just log and exit. Secure key setup is crucial.
          return; 
      }

      const storyId = context.params.storyId;
      // Cast data to StoryDocument for reading, but use StoryDocumentWriteData for updates
      const storyData = snapshot.data() as StoryDocument; 
      const storyRef = snapshot.ref; 

      logger.info(`[${storyId}] Starting generation pipeline for user ${storyData.userId}...`);

      // Double-check initial status (optional, belt-and-suspenders)
      if (storyData.status !== 'queued') {
          logger.warn(`[${storyId}] Function triggered for story not in 'queued' state (${storyData.status}). Skipping.`);
          return;
      }

      // --- 1. Initial Status Update --- 
      try {
          logger.info(`[${storyId}] Updating status to 'planning'...`);
          await storyRef.update({ 
              status: 'planning' as StoryStatus, 
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              errorMessage: null, 
          });
      } catch (error) {
          logger.error(`[${storyId}] Failed to update status to 'planning':`, error);
          // Cannot proceed if status update fails
          // No further status update here as it might fail again
          return; 
      }

      // --- Fetch Character Details --- 
      let characters: Character[] = [];
      if (storyData.characterIds && storyData.characterIds.length > 0) {
        try {
            logger.info(`[${storyId}] Fetching details for characters: ${storyData.characterIds.join(", ")}`);
            // Add type for id parameter in map
            const characterPromises = storyData.characterIds.map((id: string) => 
                db.collection('characters').doc(id).get()
            );
            const characterSnapshots = await Promise.all(characterPromises);
            
            characters = characterSnapshots
                 // Add type for doc parameter in filter
                .filter((doc: DocumentSnapshot) => doc.exists)
                 // Add type for doc parameter in map
                .map((doc: DocumentSnapshot) => ({ id: doc.id, ...doc.data() } as Character));
                
            if (characters.length !== storyData.characterIds.length) {
                logger.warn(`[${storyId}] Some characters were not found. Found ${characters.length} out of ${storyData.characterIds.length}.`);
            }
            logger.info(`[${storyId}] Successfully fetched ${characters.length} characters.`);

        } catch (error) {
             logger.error(`[${storyId}] Failed to fetch character details:`, error);
             await storyRef.update({ 
                 status: 'error' as StoryStatus, 
                 errorMessage: `Failed to fetch character details: ${error instanceof Error ? error.message : 'Unknown error'}`,
                 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
             });
             return; // Stop processing
        }
      }
      
      // --- Generate Story Plan --- 
      let plan: string[] = [];
      try {
          logger.info(`[${storyId}] Generating story plan...`);
          const characterDescriptions = characters.map(c => `- ${c.name}: ${c.description}`).join("\n");
          // --- Construct Prompt for Planning (Restore content) ---
          let planPromptContent = `Create a simple story plan for a children's story.`;
          if (storyData.topic) planPromptContent += ` The topic is "${storyData.topic}".`;
          if (storyData.originalPrompt) planPromptContent += ` Main idea: "${storyData.originalPrompt}".`;
          if (characters.length > 0) planPromptContent += `\n\nCharacters:\n${characterDescriptions}`; 
          let planLength = storyData.length === 'short' ? 3 : storyData.length === 'long' ? 7 : 5;
          planPromptContent += `\n\nPlease provide a plan with exactly ${planLength} simple scenes. Respond ONLY with a JSON array of strings. Example: ["Scene 1...", "Scene 2..."]`;
          const systemPrompt = "You create concise story plans for children.";

          // --- Call OpenAI (Restore arguments) --- 
          const response = await openai!.chat.completions.create({
              model: "gpt-4o-mini", // Use a faster/cheaper model for planning if suitable
              messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: planPromptContent },
              ],
              response_format: { type: "json_object" },
              temperature: 0.7,
          });
          // ... (Parse Plan) ...
          const result = response.choices[0]?.message?.content;
          if (!result) throw new Error("OpenAI did not return a plan.");
          try { 
              const parsedResult = JSON.parse(result);
              if (Array.isArray(parsedResult)) plan = parsedResult.filter(item => typeof item === 'string');
              else if (parsedResult.plan && Array.isArray(parsedResult.plan)) plan = parsedResult.plan.filter((item: unknown) => typeof item === 'string');
              else throw new Error("Parsed JSON response did not contain a valid plan array.");
          } catch (parseError) { throw new Error(`Failed to parse plan JSON. Response: ${result}`); }
          if (plan.length === 0) throw new Error("Generated plan was empty.");
          logger.info(`[${storyId}] Generated plan with ${plan.length} steps.`);

          // --- Update Firestore with Plan --- 
          const nextStatus: StoryStatus = 'generating_text_0'; 
          const planUpdateData: Partial<StoryDocumentWriteData> = { plan, status: nextStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
          await storyRef.update(planUpdateData);
          logger.info(`[${storyId}] Plan saved. Status updated to '${nextStatus}'.`);
      } catch (error) {
          // ... (error handling) ...
          await storyRef.update({ status: 'error', /*...*/ });
          return;
      }
      
      // --- Section Generation Loop --- 
      if (plan.length > 0) {
        const STYLE_LOCK = "..."; // Define actual style lock here
        const formatCharacterDetails = (chars: Character[]): string => { /* ... */ return "..."; };
        const characterDetailsString = formatCharacterDetails(characters);
        const initialSectionsData: StorySection[] = plan.map((planItem, index) => ({ index, planItem, text: null, imageUrl: null, audioUrl: null }));
        await storyRef.update({ sections: initialSectionsData, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        let previousText = ""; 

        for (let index = 0; index < plan.length; index++) {
            const currentPlanItem = plan[index];
            let generatedText: string | null = null;

            // --- Generate Text --- 
            try {
                const textStatus: StoryStatus = `generating_text_${index}`;
                await storyRef.update({ status: textStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                const textSystemPrompt = "You are a master storyteller for young children...";
                let textUserPrompt = `Continue the story: "${currentPlanItem}"\nContext: "${previousText}"\nCharacters: ${characterDetailsString}\nWrite 2-4 simple sentences.`;
                // --- Call OpenAI (Restore arguments) --- 
                const textResponse = await openai!.chat.completions.create({
                    model: "gpt-4o", 
                    messages: [
                        { role: "system", content: textSystemPrompt },
                        { role: "user", content: textUserPrompt },
                    ],
                    temperature: 0.7,
                    max_tokens: 150,
                });
                generatedText = textResponse.choices[0]?.message?.content?.trim() || null;
                if (!generatedText) throw new Error("OpenAI did not return text content.");
                previousText = generatedText; 
                const textUpdateData: Partial<StoryDocumentWriteData> = { [`sections.${index}.text`]: generatedText, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                await storyRef.update(textUpdateData);
            } catch (error) { /* ... Error handling ... */ return; }

            // --- Generate Image --- 
            try {
                const imageStatus: StoryStatus = `generating_image_${index}`;
                await storyRef.update({ status: imageStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                const imagePrompt = `${STYLE_LOCK} Scene: ${currentPlanItem}. ${characterDetailsString}`; 
                // --- Call OpenAI (Restore arguments) --- 
                const imageResponse = await openai!.images.generate({
                    model: "dall-e-3",
                    prompt: imagePrompt,
                    n: 1,
                    size: "1024x1024",
                    response_format: "url",
                });
                const tempImageUrl = imageResponse.data[0]?.url;
                if (!tempImageUrl) throw new Error("OpenAI did not return an image URL.");
                // ... (Fetch, upload, get permanent URL -> generatedImageUrl) ...
                 const generatedImageUrl = "https://..."; // Replace with actual URL
                 const imageUpdateData: Partial<StoryDocumentWriteData> = { [`sections.${index}.imageUrl`]: generatedImageUrl, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                 await storyRef.update(imageUpdateData);
            } catch (error) { /* ... Error handling ... */ return; }
            
             // --- Generate Audio --- 
            try {
                const audioStatus: StoryStatus = `generating_audio_${index}`;
                await storyRef.update({ status: audioStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                if (generatedText) {
                    // ... (Placeholder/Actual TTS call, upload, get permanent URL -> generatedAudioUrl) ...
                     const generatedAudioUrl = "https://..."; // Replace with actual URL
                    const audioUpdateData: Partial<StoryDocumentWriteData> = { [`sections.${index}.audioUrl`]: generatedAudioUrl, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                     await storyRef.update(audioUpdateData);
                } else { logger.warn(`Skipping audio for section ${index}: missing text.`); }
            } catch (error) { /* ... Error handling ... */ return; }
        } // End of loop

        // --- Final Status Update (Complete) --- 
        try {
            const completeUpdateData: Partial<StoryDocumentWriteData> = { status: 'complete', updatedAt: admin.firestore.FieldValue.serverTimestamp() };
            await storyRef.update(completeUpdateData);
        } catch (error) { logger.error(`Failed to update final status:`, error); }
      } // End of if (plan.length > 0)
      logger.info(`[${storyId}] Generation pipeline finished.`);
      return; 
    });
