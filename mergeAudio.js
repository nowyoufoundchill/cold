const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs-extra");
const path = require("path");

const AUDIO_DIR = path.join(__dirname, "output", "audio");
const OUTPUT_FILE = path.join(__dirname, "output", "merged_audio.mp3");

async function mergeAudioFiles() {
  const files = await fs.readdir(AUDIO_DIR);

  const mp3Files = files
    .filter((file) => file.endsWith(".mp3"))
    .sort()
    .map((file) => path.join(AUDIO_DIR, file));

  if (mp3Files.length === 0) {
    throw new Error("No audio tracks found to merge.");
  }

  console.log(`🎧 Found ${mp3Files.length} audio tracks. Merging...`);

  return new Promise((resolve, reject) => {
    const merged = ffmpeg();

    mp3Files.forEach((file) => {
      merged.input(file);
    });

    merged
      .on("error", (err) => {
        console.error("❌ Error merging audio:", err);
        reject(err);
      })
      .on("end", () => {
        console.log("✅ Audio merged successfully:", OUTPUT_FILE);
        resolve();
      })
      .mergeToFile(OUTPUT_FILE, path.join(__dirname, "temp"));
  });
}

module.exports = mergeAudioFiles;
