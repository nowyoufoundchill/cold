const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const API_KEY = process.env.STABILITY_API_KEY;

async function generateImage(prompt) {
  console.log("🖼️ Generating image from prompt:", prompt);

  const outputPath = path.join(__dirname, "output", "image.png");

  const response = await axios.post(
    "https://api.stability.ai/v1/generation/stable-diffusion-v1-5/text-to-image",
    {
      text_prompts: [{ text: prompt }],
      cfg_scale: 8,
      clip_guidance_preset: "FAST_BLUE",
      height: 512,
      width: 896,
      samples: 1,
      steps: 30
    },
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const base64Image = response.data.artifacts[0].base64;
  const imageBuffer = Buffer.from(base64Image, "base64");

  await fs.outputFile(outputPath, imageBuffer);
  console.log("✅ Image saved:", outputPath);
}

module.exports = generateImage;
