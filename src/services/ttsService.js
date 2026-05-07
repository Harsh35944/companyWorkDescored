import * as googleTTS from "google-tts-api";
import { logger } from "../utils/logger.js";

export async function generateTTSUrl(text, lang) {
  try {
    // google-tts-api can handle up to 200 chars per request.
    // Use getAllAudioUrls to split long text into multiple chunks.
    const results = googleTTS.getAllAudioUrls(text, {
      lang: lang || "en",
      slow: false,
      host: "https://translate.google.com",
      splitPunct: ".,!?",
    });
    
    // For now, we return the first one or a list if possible.
    // However, the bot expects a single URL. Let's return the first chunk's URL
    // and maybe log if there are more.
    if (results.length > 1) {
      logger.warn("TTS text truncated to first chunk", { length: text.length });
    }
    return results[0].url;
  } catch (err) {
    logger.error("TTS generation failed", { error: err.message, text, lang });
    return null;
  }
}
