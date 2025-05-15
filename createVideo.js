const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs-extra");

async function createVideo() {
  const imagePath = path.join(__dirname, "output", "image.png");
  const audioPath = path.join(__dirname, "output", "merged_audio.mp3");
  const videoPath = path.join(__dirname, "output", "final_video.mp4");

  // Verify that input files exist
  if (!fs.existsSync(imagePath)) {
    throw new Error("Image file not found.");
  }

  if (!fs.existsSync(audioPath)) {
    throw new Error("Merged audio file not found.");
  }

  console.log("🎞️ Creating video from image and audio...");

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .loop()
      .input(audioPath)
      .inputOptions(["-framerate 1"])
      .outputOptions([
        "-c:v libx264",
        "-tune stillimage",
        "-c:a aac",
        "-b:a 192k",
        "-pix_fmt yuv420p",
        "-shortest"
      ])
      .size("1920x1080")
      .output(videoPath)
      .on("end", () => {
        console.log("✅ Video created successfully:", videoPath);
        resolve();
      })
      .on("error", (err) => {
        console.error("❌ Error creating video:", err.message);
        reject(err);
      })
      .run();
  });
}

module.exports = createVideo;
