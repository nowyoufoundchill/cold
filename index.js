const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");

const sunoAutomation = require("./sunoAutomation");
const mergeAudioFiles = require("./mergeAudio");
const generateImage = require("./generateImage");
const createVideo = require("./createVideo");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

app.post("/", async (req, res) => {
  const { prompts, imagePrompt } = req.body;

  if (!Array.isArray(prompts) || prompts.length < 5) {
    return res.status(400).json({ error: "You must provide 5 audio prompts." });
  }

  if (typeof imagePrompt !== "string" || !imagePrompt.trim()) {
    return res.status(400).json({ error: "Missing or invalid imagePrompt." });
  }

  try {
    console.log("🚀 Starting NowYouFoundChill automation pipeline...");
    console.log("🎧 Prompts:", prompts);
    console.log("🖼️ Image prompt:", imagePrompt);

    await sunoAutomation(prompts);
    await mergeAudioFiles();
    await generateImage(imagePrompt);
    await createVideo();

    res.status(200).json({ status: "success", message: "Video created!" });
  } catch (error) {
    console.error("💥 Pipeline failed:", error);
    res.status(500).json({ error: "Pipeline failed. See logs for details." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ NowYouFoundChill running at http://localhost:${PORT}`);
});
