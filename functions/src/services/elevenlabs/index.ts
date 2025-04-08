/**
 * ElevenLabs Text-to-Speech Service for Firebase Functions
 * Provides voice synthesis capabilities using the ElevenLabs API
 */

import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { defineString } from "firebase-functions/params";

// Define the secret parameter for the ElevenLabs API Key
const elevenLabsApiKey = defineString("ELEVENLABS_API_KEY");

// Default voices available in ElevenLabs
export const ELEVENLABS_VOICES = {
  FEMALE_YOUNG: "MF3mGyEYCl7XYWbV9V6O", // Nicole - Warm, expressive female voice
  MALE_YOUNG: "TxGEqnHWrfWFTfGW9XjX", // Josh - Friendly male voice
  FEMALE_CHILD: "XrExE9yKIg1WjnnlVkGX", // Mia - Child female voice
  MALE_CHILD: "IKne3meq5aSn9XLyUdCD", // Adam - Child male voice
};

// Default model for multilingual support
const DEFAULT_MODEL = "eleven_multilingual_v2";

// ElevenLabs configuration options
export interface ElevenLabsConfig {
  voiceId?: string;
  modelId?: string;
  stability?: number; // 0-1
  similarityBoost?: number; // 0-1
}

/**
 * Generate audio using ElevenLabs TTS API
 * @param text Text to convert to speech
 * @param config ElevenLabs configuration options
 * @returns Buffer containing audio data (MP3 format)
 */
export async function generateElevenLabsAudio(
  text: string,
  config?: ElevenLabsConfig
): Promise<Buffer> {
  logger.info("Generating audio with ElevenLabs TTS");
  
  // Retrieve the API key from Firebase secret
  const apiKey = elevenLabsApiKey.value();
  if (!apiKey) {
    logger.error("ElevenLabs API Key is not configured. Set ELEVENLABS_API_KEY secret.");
    throw new Error("API key configuration error for ElevenLabs.");
  }
  
  // Get configuration options with defaults
  const voiceId = config?.voiceId || ELEVENLABS_VOICES.FEMALE_YOUNG;
  const modelId = config?.modelId || DEFAULT_MODEL;
  const stability = config?.stability ?? 0.5; // Default if not provided
  const similarityBoost = config?.similarityBoost ?? 0.75; // Default if not provided
  
  // URL for ElevenLabs TTS API - we use the stream endpoint for binary data
  const elevenLabsTtsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
  
  try {
    logger.info(`Sending TTS request to ElevenLabs for text (${text.length} chars) with voice ${voiceId}`);
    
    // Dynamically import fetch
    const { default: fetch } = await import("node-fetch");
    
    // Make request to ElevenLabs API
    const response = await fetch(elevenLabsTtsUrl, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: stability,
          similarity_boost: similarityBoost,
        },
      }),
    });
    
    // Check for error response
    if (!response.ok) {
      const errorText = await response.text();
      logger.error("ElevenLabs API Error:", response.status, errorText);
      throw new Error(`ElevenLabs API Error ${response.status}: ${errorText}`);
    }
    
    // Get binary audio data (MP3)
    const audioBuffer = await response.buffer();
    logger.info(`ElevenLabs audio generated successfully (${audioBuffer.length} bytes)`);
    
    return audioBuffer;
  } catch (error) {
    logger.error("ElevenLabs audio generation failed:", error);
    throw error;
  }
}

/**
 * Uploads ElevenLabs audio to Firebase Storage
 * Helper function to handle the common pattern of generating and storing
 * @param text Text content to convert to speech
 * @param storagePath Path in Firebase Storage where audio should be saved
 * @param config ElevenLabs configuration options
 * @returns Public URL of the uploaded audio file
 */
export async function generateAndUploadElevenLabsAudio(
  text: string,
  storagePath: string,
  config?: ElevenLabsConfig
): Promise<string> {
  try {
    logger.info(`Generating and uploading ElevenLabs audio to ${storagePath}`);
    
    // Generate the audio with ElevenLabs
    const audioBuffer = await generateElevenLabsAudio(text, config);
    
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
    logger.info(`ElevenLabs audio successfully uploaded to ${storagePath}. URL: ${audioUrl}`);
    
    return audioUrl;
  } catch (error) {
    logger.error(`Failed to generate and upload ElevenLabs audio to ${storagePath}:`, error);
    throw error;
  }
} 