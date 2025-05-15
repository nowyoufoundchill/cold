const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const { ensureAudioFolder } = require("./utils/fileHelpers");

/**
 * Converts text prompt to a safe file prefix
 * @param {string} text - Input text to slugify
 * @returns {string} - Slugified text
 */
const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);

/**
 * Automates music generation and downloading from Suno
 * @param {string[]} prompts - Array of text prompts to generate music from
 * @param {Object} options - Configuration options
 * @returns {Promise<Array>} - Array of downloaded track information
 */
async function sunoAutomation(prompts, options = {}) {
  // Default options
  const config = {
    tracksPerPrompt: 2,
    instrumental: true,
    headless: "new",
    downloadWaitTime: 30000, // 30 seconds for downloads
    generationTimeout: 120000, // 2 minutes for generation
    retryAttempts: 3,
    ...options
  };

  const SUNO_COOKIE = process.env.SUNO_COOKIE;
  if (!SUNO_COOKIE) {
    throw new Error("SUNO_COOKIE environment variable is not set");
  }

  // Ensure audio folder exists
  const audioFolder = await ensureAudioFolder();
  console.log(`📁 Audio folder ready at: ${audioFolder}`);

  // Track results for return
  const results = [];

  // Launch browser
  const browser = await puppeteer.launch({
    headless: config.headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    executablePath: puppeteer.executablePath(),
  });

  try {
    // Create page
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });

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

    // Process each prompt
    for (let promptIndex = 0; promptIndex < prompts.length; promptIndex++) {
      const prompt = prompts[promptIndex];
      console.log(`🎵 Processing prompt ${promptIndex + 1}/${prompts.length}: "${prompt}"`);
      
      const slug = slugify(prompt);
      
      // Generate multiple tracks per prompt
      for (let trackNum = 1; trackNum <= config.tracksPerPrompt; trackNum++) {
        const trackName = `${slug}-Track${trackNum}`;
        let success = false;
        let attempts = 0;
        
        // Retry logic
        while (!success && attempts < config.retryAttempts) {
          attempts++;
          try {
            console.log(`🎼 Generating: ${trackName} (Attempt ${attempts}/${config.retryAttempts})`);
            
            // Generate the track
            await generateTrack(page, prompt, trackName, config);
            
            // Download the track
            await downloadTrack(page, trackName, config.downloadWaitTime);
            
            results.push({
              prompt,
              trackName,
              timestamp: new Date().toISOString()
            });
            
            success = true;
            console.log(`✅ Successfully generated and triggered download for: ${trackName}`);
          } catch (error) {
            console.error(`❌ Error processing ${trackName} (Attempt ${attempts}/${config.retryAttempts}):`, error.message);
            
            // If it's the last attempt, we'll just move on to the next track
            if (attempts >= config.retryAttempts) {
              console.error(`⚠️ Failed to process ${trackName} after ${config.retryAttempts} attempts. Moving to next track.`);
            }
            
            // Wait briefly before retry
            await page.waitForTimeout(2000);
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error("❌ Fatal error in Suno automation:", error);
    throw error;
  } finally {
    // Always close the browser
    await browser.close();
    console.log("✅ Suno automation complete.");
  }
}

/**
 * Generate a track on Suno
 * @param {Page} page - Puppeteer page object
 * @param {string} prompt - The text prompt for generation
 * @param {string} trackName - The name for the track
 * @param {Object} config - Configuration options
 */
async function generateTrack(page, prompt, trackName, config) {
  // Go to create page
  await page.goto("https://suno.com/create?wid=default", { 
    waitUntil: "networkidle2",
    timeout: 30000 
  });

  // Wait and type into prompt field
  const promptSelector = 'textarea[placeholder="Enter style description"]';
  await page.waitForSelector(promptSelector, { timeout: 15000 });
  await page.type(promptSelector, prompt);

  // Toggle "Instrumental" if requested
  if (config.instrumental) {
    try {
      const [instrumentalToggle] = await page.$x("//div[contains(text(), 'Instrumental')]");
      if (instrumentalToggle) {
        await instrumentalToggle.click();
        console.log("🎛️ Instrumental mode ON");
        await page.waitForTimeout(300);
      }
    } catch (error) {
      console.warn("⚠️ Couldn't toggle instrumental mode:", error.message);
    }
  }

  // Expand "More Options" and enter title
  try {
    const [moreOptions] = await page.$x("//div[contains(text(), 'More Options')]");
    if (moreOptions) {
      await moreOptions.click();
      await page.waitForTimeout(500);
      
      const titleInput = await page.$('input[placeholder="Enter song title"]');
      if (titleInput) {
        await titleInput.type(trackName);
      }
    }
  } catch (error) {
    console.warn("⚠️ Couldn't set track title:", error.message);
  }

  // Click generate button and wait for generation
  const generateButton = await page.$("#generate-button");
  if (!generateButton) {
    throw new Error("Generate button not found");
  }
  
  await generateButton.click();
  console.log(`⏳ Waiting for track generation: ${trackName}`);
  
  // Wait for minimum time for generation to complete
  await page.waitForTimeout(config.generationTimeout);
}

/**
 * Download a track from Suno library
 * @param {Page} page - Puppeteer page object
 * @param {string} trackName - The name of the track to download
 * @param {number} waitTime - How long to wait for download to complete
 * @returns {Promise<void>}
 */
async function downloadTrack(page, trackName, waitTime) {
  // Go to library
  await page.goto("https://suno.com/library?liked=true", { 
    waitUntil: "networkidle2",
    timeout: 30000
  });
  
  // Wait for library to load
  await page.waitForTimeout(2000);

  // Look for the track in the library - try two different possible XPaths
  let menuButtons = [];
  
  // First attempt - exact match
  const exactXPath = `//div[contains(text(), '${trackName}')]//ancestor::div[contains(@class, 'chakra-card')]//button[contains(@class, 'chakra-menu__menu-button')]`;
  menuButtons = await page.$x(exactXPath);
  
  // Second attempt - partial match if exact match fails
  if (menuButtons.length === 0) {
    const partialXPath = `//div[contains(text(), '${trackName.substring(0, 20)}')]//ancestor::div[contains(@class, 'chakra-card')]//button[contains(@class, 'chakra-menu__menu-button')]`;
    menuButtons = await page.$x(partialXPath);
  }
  
  // Third attempt - try finding any menu button and use the first one (last resort)
  if (menuButtons.length === 0) {
    const allMenuXPath = `//button[contains(@class, 'chakra-menu__menu-button')]`;
    menuButtons = await page.$x(allMenuXPath);
    
    if (menuButtons.length > 0) {
      console.warn(`⚠️ Track "${trackName}" not found in library. Using the first available track instead.`);
    }
  }
  
  if (menuButtons.length === 0) {
    throw new Error(`No tracks found in library`);
  }
  
  // Click menu button
  await menuButtons[0].click();
  await page.waitForTimeout(500);
  
  // Click "Download" > "MP3 Audio"
  const [downloadOption] = await page.$x("//div[contains(text(), 'Download')]");
  if (!downloadOption) {
    throw new Error("Download menu option not found");
  }
  
  await downloadOption.hover();
  await page.waitForTimeout(500);
  
  const [mp3Option] = await page.$x("//div[contains(text(), 'MP3 Audio')]");
  if (!mp3Option) {
    throw new Error("MP3 Audio option not found");
  }
  
  // Click the download option
  await mp3Option.click();
  console.log(`⬇️ Download triggered: ${trackName}`);
  
  // Wait for a reasonable time for the download to complete
  // Since we can't directly monitor the download in a deployment environment,
  // we'll just wait a fixed amount of time
  await page.waitForTimeout(waitTime);
}

module.exports = sunoAutomation;
