const fs = require("fs-extra");
const path = require("path");

async function ensureAudioFolder() {
  const audioPath = path.join(__dirname, "..", "output", "audio");
  await fs.ensureDir(audioPath);
}

module.exports = { ensureAudioFolder };
