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
 * @returns {Promise<void>}
 */
async function sunoAutomation(prompts) {
  console.log("🚀 STARTING AUTOMATION WITH MINIMAL VERSION");
  console.log("🔍 Checking for waitForTimeout call...");
  
  // Manual delay function without using page.waitForTimeout
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    await ensureAudioFolder();
    
    // Get cookie from environment
    const SUNO_COOKIE = process.env.SUNO_COOKIE;
    if (!SUNO_COOKIE) {
      throw new Error("SUNO_COOKIE not provided");
    }

    // Launch browser
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: puppeteer.executablePath(),
    });

    // Create new page
    const page = await browser.newPage();
    
    // Set cookie for authentication
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
    for (const prompt of prompts) {
      const slug = slugify(prompt);
      
      // Generate 2 tracks per prompt
      for (let i = 1; i <= 2; i++) {
        const trackName = `${slug}-Track${i}`;
        console.log(`🎼 Generating: ${trackName}`);
        
        try {
          // Navigate to create page
          await page.goto("https://suno.com/create?wid=default", { waitUntil: "networkidle2" });
          
          // Wait for page to be interactive
          console.log("Waiting 5 seconds for page...");
          await delay(5000);
          
          // Find prompt field (no waitForSelector)
          console.log("Looking for prompt field...");
          let promptField = null;
          
          // Try multiple selectors without waitForSelector
          const promptSelectors = [
            'textarea[placeholder="Enter style description"]',
            'textarea.chakra-textarea',
            'textarea',
            'div[contenteditable="true"]'
          ];
          
          for (const selector of promptSelectors) {
            promptField = await page.$(selector);
            if (promptField) {
              console.log(`Found prompt field with selector: ${selector}`);
              await promptField.type(prompt);
              break;
            }
          }
          
          if (!promptField) {
            console.error("Could not find prompt field with any selector");
            throw new Error("Prompt field not found");
          }
          
          // Try to toggle instrumental mode
          console.log("Trying to toggle instrumental mode...");
          try {
            const instrumentalElements = await page.$x("//div[contains(text(), 'Instrumental')]");
            if (instrumentalElements.length > 0) {
              await instrumentalElements[0].click();
              console.log("🎛️ Instrumental mode ON");
              await delay(300);
            }
          } catch (error) {
            console.log("Couldn't toggle instrumental mode");
          }
          
          // Try to set track title
          console.log("Trying to set track title...");
          try {
            const moreOptionsElements = await page.$x("//div[contains(text(), 'More Options')]");
            if (moreOptionsElements.length > 0) {
              await moreOptionsElements[0].click();
              await delay(300);
              
              const titleInput = await page.$('input[placeholder="Enter song title"]');
              if (titleInput) {
                await titleInput.type(trackName);
              }
            }
          } catch (error) {
            console.log("Couldn't set track title");
          }
          
          // Try to find generate button
          console.log("Looking for generate button...");
          const generateButtonSelector = "#generate-button";
          const generateButton = await page.$(generateButtonSelector);
          
          if (!generateButton) {
            console.error("Generate button not found");
            throw new Error("Generate button not found");
          }
          
          // Click generate button
          await generateButton.click();
          console.log(`⏳ Waiting for track generation: ${trackName}`);
          
          // Wait for generation (2 minutes)
          console.log("Waiting 120 seconds for generation...");
          await delay(120000);
          
          // Navigate to library to download
          console.log("Navigating to library...");
          await page.goto("https://suno.com/library?liked=true", { waitUntil: "networkidle2" });
          await delay(5000);
          
          // Find track in library
          console.log("Looking for track in library...");
          const trackXpath = `//div[contains(text(), '${trackName}')]//ancestor::div[contains(@class, 'chakra-card')]//button[contains(@class, 'chakra-menu__menu-button')]`;
          const menuButtons = await page.$x(trackXpath);
          
          if (menuButtons.length === 0) {
            console.warn(`⚠️ Could not find menu button for: ${trackName}`);
            continue;
          }
          
          // Click menu
          await menuButtons[0].click();
          await delay(500);
          
          // Click "Download" > "MP3 Audio"
          const downloadOptions = await page.$x("//div[contains(text(), 'Download')]");
          if (downloadOptions.length > 0) {
            await downloadOptions[0].hover();
            await delay(500);
            
            const mp3Options = await page.$x("//div[contains(text(), 'MP3 Audio')]");
            if (mp3Options.length > 0) {
              await mp3Options[0].click();
              console.log(`⬇️ Download triggered: ${trackName}`);
              
              // Wait for download to complete
              console.log("Waiting 30 seconds for download...");
              await delay(30000);
            } else {
              console.warn("⚠️ MP3 option not found");
            }
          } else {
            console.warn("⚠️ Download menu not found");
          }
        } catch (error) {
          console.error(`Error processing ${trackName}:`, error.message);
        }
      }
    }

    // Close browser
    await browser.close();
    console.log("✅ Suno automation complete.");
  } catch (error) {
    console.error("❌ Fatal error in Suno automation:", error);
    throw error;
  }
}

module.exports = sunoAutomation;
