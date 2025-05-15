const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const { ensureAudioFolder } = require("./utils/fileHelpers");

const SUNO_COOKIE = process.env.SUNO_COOKIE;

// Converts text prompt to a safe file prefix
const slugify = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").substring(0, 30);

async function sunoAutomation(prompts) {
  await ensureAudioFolder();

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: puppeteer.executablePath(),
  });

  const page = await browser.newPage();

  // Set session cookie to authenticate
  await page.setCookie({
    name: "session",
    value: SUNO_COOKIE,
    domain: ".suno.com",
    path: "/",
    httpOnly: true,
    secure: true,
  });

  console.log("✅ Logged into Suno with session");

  let trackIndex = 1;

  for (const prompt of prompts) {
    const slug = slugify(prompt);

    for (let i = 1; i <= 2; i++) {
      const trackName = `${slug}-Track${i}`;
      console.log(`🎼 Generating: ${trackName}`);

      await page.goto("https://suno.com/create?wid=default", { waitUntil: "networkidle2" });

      // Wait and type into prompt field
      await page.waitForSelector('textarea[placeholder="Enter style description"]', {
        timeout: 15000,
      });
      await page.type('textarea[placeholder="Enter style description"]', prompt);

      // Toggle "Instrumental"
      const [instrumentalToggle] = await page.$x("//div[contains(text(), 'Instrumental')]");
      if (instrumentalToggle) {
        await instrumentalToggle.click();
        console.log("🎛️ Instrumental mode ON");
        await page.waitForTimeout(300);
      }

      // Expand "More Options" and enter title
      const [moreOptions] = await page.$x("//div[contains(text(), 'More Options')]");
      if (moreOptions) {
        await moreOptions.click();
        await page.waitForTimeout(300);
        await page.type('input[placeholder="Enter song title"]', trackName);
      }

      await page.click("#generate-button");
      console.log(`⏳ Waiting for track: ${trackName}`);
      await page.waitForTimeout(15000); // Wait for track generation (adjust if needed)

      // Open library to get the download menu
      await page.goto("https://suno.com/library?liked=true", { waitUntil: "networkidle2" });

      const trackXpath = `//div[contains(text(), '${trackName}')]//ancestor::div[contains(@class, 'chakra-card')]//button[contains(@class, 'chakra-menu__menu-button')]`;
      const [menuBtn] = await page.$x(trackXpath);
      if (!menuBtn) {
        console.warn(`⚠️ Could not find menu button for: ${trackName}`);
        continue;
      }

      await menuBtn.click();
      await page.waitForTimeout(500);

      // Click "Download" > "MP3 Audio"
      const [downloadOption] = await page.$x("//div[contains(text(), 'Download')]");
      if (downloadOption) {
        await downloadOption.hover();
        await page.waitForTimeout(500);

        const [mp3Option] = await page.$x("//div[contains(text(), 'MP3 Audio')]");
        if (mp3Option) {
          await mp3Option.click();
          console.log(`⬇️ Download triggered: ${trackName}`);
        } else {
          console.warn("⚠️ MP3 option not found");
        }
      } else {
        console.warn("⚠️ Download menu not found");
      }

      await page.waitForTimeout(10000); // Let the download complete
      trackIndex++;
    }
  }

  await browser.close();
  console.log("✅ Suno automation complete.");
}

module.exports = sunoAutomation;
