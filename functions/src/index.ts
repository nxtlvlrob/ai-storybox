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

// Import types using the path alias
import { StoryDocument, StoryStatus, StorySection } from "../../types/story-document";
import { Character } from "../../types/character";

// Firebase specific types
export type StoryDocumentWriteData = Omit<StoryDocument, 'createdAt' | 'updatedAt'> & {
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

// --- Google Cloud Client Initialization ---

// Configure Vertex AI Client
// Note: The location often depends on the region where your models are available/project is set up.
// Common locations: "us-central1", "europe-west4", etc.
// Ensure the function's service account has "Vertex AI User" role.
const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT; // Get project ID from environment
const location = "us-central1"; // Or your preferred region
const aiplatform = require("@google-cloud/aiplatform");
const {predictionService} = aiplatform.v1;
const clientOptions = {
  apiEndpoint: `${location}-aiplatform.googleapis.com`,
};
const vertexAiClient = new predictionService.PredictionServiceClient(clientOptions);

// Initialize Text-to-Speech Client
// Ensure the function's service account has "Cloud Text-to-Speech API User" role.
const ttsClient = new TextToSpeechClient();

// === Main Cloud Function: Orchestrate Story Generation (v2 Syntax) ===

// Define runtime options for v2 trigger
const runtimeOpts = {
  timeoutSeconds: 540,
};

export const generateStoryPipeline = onDocumentCreated(
  { document: "stories/{storyId}", ...runtimeOpts }, // Pass options here
  async (event): Promise<void> => { // Event object provided by v2 trigger
    // Check if clients initialized (basic check)
    if (!vertexAiClient || !ttsClient) {
        logger.error("Cloud clients not initialized.");
        return;
    }
    if (!project) {
        logger.error("Google Cloud Project ID not found in environment.");
        return;
    }

    // Get data and context from the event object
    const snapshot = event.data; // The DocumentSnapshot
    if (!snapshot) {
      logger.error("No data associated with the event");
      return;
    }
    const storyId = event.params.storyId; // Access params from event
    const storyData = snapshot.data() as StoryDocument; 
    const storyRef = snapshot.ref; 

    logger.info(`[${storyId}] v2 Vertex: Starting pipeline for user ${storyData.userId}...`);

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
          const characterPromises = storyData.characterIds.map((id: string) => 
              db.collection('characters').doc(id).get()
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
               status: 'error' as StoryStatus, 
               errorMessage: `Failed fetching characters: ${error instanceof Error ? error.message : 'Unknown'}`,
               updatedAt: admin.firestore.FieldValue.serverTimestamp(),
           });
           return; 
      }
    }
    
    // --- Generate Story Plan --- 
    let plan: string[] = [];
    try {
        logger.info(`[${storyId}] Generating story plan using Vertex AI Gemini...`);
        const characterDescriptions = characters.map(c => `- ${c.name}: ${c.description}`).join("\n");
        let planPrompt = `Create a simple story plan (JSON array) for a children\'s story. Topic: "${storyData.topic || 'adventure'}". Main idea: "${storyData.originalPrompt || 'A fun day'}".`;
        if (characters.length > 0) planPrompt += `\nCharacters:\n${characterDescriptions}`; 
        let planLength = storyData.length === 'short' ? 3 : storyData.length === 'long' ? 7 : 5;
        planPrompt += `\nPlan should have exactly ${planLength} simple scenes. Respond ONLY with a JSON object containing a "plan" key with an array of strings. Example: {\"plan\": [\"Scene 1...\", \"Scene 2...\"]}`;
        
        // Construct Vertex AI request payload for Gemini
        const instances = [{ content: planPrompt }];
        const parameters = {
            temperature: 0.7,
            maxOutputTokens: 1024, // Adjust as needed for plan length
            topP: 0.95,
            topK: 40,
            // Enforce JSON output if supported directly by model/API version
            // responseMimeType: "application/json", 
        };
        const endpoint = `projects/${project}/locations/${location}/publishers/google/models/gemini-1.0-pro`; // Corrected endpoint format 

        const request = {
            endpoint: endpoint,
            instances: instances.map(instance => aiplatform.helpers.toValue(instance)), // Convert to Value objects
            parameters: aiplatform.helpers.toValue(parameters),
        };

        const [response] = await vertexAiClient.predict(request);
        if (!response.predictions || response.predictions.length === 0) {
            throw new Error("Vertex AI returned no predictions for plan.");
        }

        const prediction = aiplatform.helpers.fromValue(response.predictions[0] as any);
        const resultText = prediction?.content || ''; // Gemini response structure
        logger.info(`[${storyId}] Raw plan response:`, resultText);

        try { 
            const parsedResult = JSON.parse(resultText);
            if (parsedResult.plan && Array.isArray(parsedResult.plan)) {
                plan = parsedResult.plan.filter((item: unknown) => typeof item === 'string');
            } else {
                // Fallback: Try to extract array directly if plan key missing
                 if (Array.isArray(parsedResult)) plan = parsedResult.filter(item => typeof item === 'string');
                 else throw new Error("Parsed JSON missing 'plan' array.");
            }
        } catch (parseError) { 
             // Attempt to extract JSON array from potential markdown ```json ... ```
             const jsonMatch = resultText.match(/```json\n?([\s\S]*?)\n?```/);
             if (jsonMatch && jsonMatch[1]) {
                 try {
                     const fallbackParsed = JSON.parse(jsonMatch[1]);
                     if (fallbackParsed.plan && Array.isArray(fallbackParsed.plan)) {
                         plan = fallbackParsed.plan.filter((item: unknown) => typeof item === 'string');
                     } else if (Array.isArray(fallbackParsed)) {
                         plan = fallbackParsed.filter(item => typeof item === 'string');
                     } else { throw new Error("Fallback parse failed"); }
                 } catch (fallbackError) {
                     throw new Error(`Plan parse error: ${parseError}. Raw: ${resultText}`);
                 }
             } else {
                 throw new Error(`Plan parse error: ${parseError}. Raw: ${resultText}`);
             }
        }
        if (plan.length === 0) throw new Error("Parsed plan was empty.");
        logger.info(`[${storyId}] Generated plan.`);
        
        // --- Update Firestore with Plan --- 
        const nextStatus: StoryStatus = 'generating_text_0'; 
        const planUpdateData: Partial<StoryDocumentWriteData> = { plan, status: nextStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        await storyRef.update(planUpdateData);
        logger.info(`[${storyId}] Plan saved, status '${nextStatus}'.`);
    } catch (error) {
        logger.error(`[${storyId}] Failed generating plan:`, error);
        await storyRef.update({ 
            status: 'error' as StoryStatus, 
            errorMessage: `Failed generating plan: ${error instanceof Error ? error.message : 'Unknown'}`,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
    }
      
    // --- Section Generation Loop --- 
    if (plan.length > 0) {
      const STYLE_LOCK = "Children's storybook illustration, simple, friendly, colorful."; 
      const formatCharacterDetails = (chars: Character[]): string => chars.map(c => `${c.name} (${c.description})`).join(", ");
      const characterDetailsString = formatCharacterDetails(characters);
      const initialSectionsData: StorySection[] = plan.map((planItem, index) => ({ index, planItem, text: null, imageUrl: null, audioUrl: null }));
      await storyRef.update({ sections: initialSectionsData, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      let previousText = "The story begins."; 

      for (let index = 0; index < plan.length; index++) {
          const currentPlanItem = plan[index];
          let generatedText: string | null = null;

          // --- Generate Text using Vertex AI Gemini --- 
          try {
              const textStatus: StoryStatus = `generating_text_${index}`;
              await storyRef.update({ status: textStatus });
              const textPrompt = `Continue the children's story based on this scene: "${currentPlanItem}"\nPrevious part: "${previousText}"\nCharacters involved: ${characterDetailsString}\nWrite 2-4 simple, engaging sentences appropriate for a 3-8 year old.`;
              
              const textModel = `projects/${project}/locations/${location}/publishers/google/models/gemini-1.0-pro`; // Or a different Gemini variant
              const textInstances = [{ content: textPrompt }];
              const textParameters = { temperature: 0.7, maxOutputTokens: 200, topP: 0.95, topK: 40 };
              const textRequest = {
                  endpoint: textModel,
                  instances: textInstances.map(instance => aiplatform.helpers.toValue(instance)),
                  parameters: aiplatform.helpers.toValue(textParameters),
              };
              
              const [textResponse] = await vertexAiClient.predict(textRequest);
              if (!textResponse.predictions || textResponse.predictions.length === 0) {
                  throw new Error("Vertex AI returned no predictions for text.");
              }
              const textPrediction = aiplatform.helpers.fromValue(textResponse.predictions[0] as any);
              generatedText = textPrediction?.content?.trim() || null;
              
              if (!generatedText) throw new Error("Text generation failed (empty content).");
              previousText = generatedText; 
              const textUpdateData: Partial<StoryDocumentWriteData> = { [`sections.${index}.text`]: generatedText };
              await storyRef.update(textUpdateData);
          } catch (error) { logger.error(`[${storyId}] Text gen failed (sec ${index}):`, error); await storyRef.update({ status: 'error', /*...*/ }); return; }

          // --- Generate Image using Vertex AI Imagen --- 
          try {
              const imageStatus: StoryStatus = `generating_image_${index}`;
              await storyRef.update({ status: imageStatus });
              // Adjust prompt for Imagen model
              const imagePrompt = `Children's storybook illustration, simple friendly style. ${STYLE_LOCK}. Scene depicting: ${generatedText}. Characters: ${characterDetailsString}.`; 
              
              const imageModel = `projects/${project}/locations/${location}/publishers/google/models/imagegeneration@006`; // Example Imagen model
              const imageInstances = [{ prompt: imagePrompt }];
              const imageParameters = { 
                  sampleCount: 1, 
                  // Aspect ratio and other Imagen params if needed
              }; 
              const imageRequest = {
                  endpoint: imageModel,
                  instances: imageInstances.map(instance => aiplatform.helpers.toValue(instance)),
                  parameters: aiplatform.helpers.toValue(imageParameters),
              };
              
              const [imageResponse] = await vertexAiClient.predict(imageRequest);
              if (!imageResponse.predictions || imageResponse.predictions.length === 0) {
                  throw new Error("Imagen returned no predictions.");
              }
              const imagePrediction = aiplatform.helpers.fromValue(imageResponse.predictions[0] as any);
              const imageBytesBase64 = imagePrediction?.bytesBase64Encoded; // Imagen returns base64 bytes
              
              if (!imageBytesBase64) throw new Error("Image generation failed (no image data).");

              // Upload image bytes to GCS
              const imageBuffer = Buffer.from(imageBytesBase64, 'base64');
              const imagePath = `stories/${storyId}/images/section_${index}.png`;
              const imageFile = storage.bucket().file(imagePath);
              await imageFile.save(imageBuffer, { metadata: { contentType: 'image/png' } });
              await imageFile.makePublic(); // Make it publicly readable
              const generatedImageUrl = imageFile.publicUrl();

              logger.info(`[${storyId}] Image uploaded to: ${generatedImageUrl}`);
              const imageUpdateData: Partial<StoryDocumentWriteData> = { [`sections.${index}.imageUrl`]: generatedImageUrl };
              await storyRef.update(imageUpdateData);

          } catch (error) { logger.error(`[${storyId}] Image gen failed (sec ${index}):`, error); await storyRef.update({ status: 'error', /*...*/ }); return; }
          
          // --- Generate Audio using Google Cloud TTS --- 
          try {
              const audioStatus: StoryStatus = `generating_audio_${index}`;
              await storyRef.update({ status: audioStatus });
              if (generatedText) {
                  const ttsRequest = {
                      input: { text: generatedText },
                      // Select voice params (language, gender, voice name)
                      // See https://cloud.google.com/text-to-speech/docs/voices
                      voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' as const, name: 'en-US-Standard-C' }, 
                      audioConfig: { audioEncoding: 'MP3' as const },
                  };

                  const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
                  if (!ttsResponse.audioContent) throw new Error("TTS returned no audio content.");

                  // Upload audio to GCS
                  const audioPath = `stories/${storyId}/audio/section_${index}.mp3`;
                  const audioFile = storage.bucket().file(audioPath);
                  await audioFile.save(ttsResponse.audioContent as Buffer, { metadata: { contentType: 'audio/mpeg' } });
                  await audioFile.makePublic(); // Make public
                  const generatedAudioUrl = audioFile.publicUrl();

                  logger.info(`[${storyId}] Audio uploaded to: ${generatedAudioUrl}`);
                  const audioUpdateData: Partial<StoryDocumentWriteData> = { [`sections.${index}.audioUrl`]: generatedAudioUrl };
                  await storyRef.update(audioUpdateData);

              } else { logger.warn(`[${storyId}] Skipping audio (sec ${index}): missing text.`); }
          } catch (error) { logger.error(`[${storyId}] Audio gen/upload failed (sec ${index}):`, error); await storyRef.update({ status: 'error', /*...*/ }); return; }
      } // End of loop

      // --- Final Status Update (Complete) --- 
      try {
          const completeUpdateData: Partial<StoryDocumentWriteData> = { status: 'complete', updatedAt: admin.firestore.FieldValue.serverTimestamp() };
          await storyRef.update(completeUpdateData);
      } catch (error) { logger.error(`Failed to update final status:`, error); }
    } // End of if (plan.length > 0)
    logger.info(`[${storyId}] Generation pipeline finished.`);
    return; 
}); // End of onDocumentCreated
