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
  console.log("🚀 STARTING SUPER DIRECT AUTOMATION WITH DEBUG INFO");
  
  // Manual delay function
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    await ensureAudioFolder();
    
    // Get cookie from environment
    const SUNO_COOKIE = process.env.SUNO_COOKIE;
    if (!SUNO_COOKIE) {
      throw new Error("SUNO_COOKIE not provided");
    }

    // Launch browser with more permissive settings
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process"
      ],
      executablePath: puppeteer.executablePath(),
    });

    // Create new page
    const page = await browser.newPage();
    
    // Set longer default navigation timeout
    page.setDefaultNavigationTimeout(60000);
    
    // Log console messages from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
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
          console.log("Navigating to create page...");
          await page.goto("https://suno.com/create?wid=default", { 
            waitUntil: "networkidle2", 
            timeout: 60000 
          });
          
          // Wait longer for page to load
          console.log("Waiting 10 seconds for page to fully load...");
          await delay(10000);
          
          // Take screenshot to see what we're working with
          const screenshotPath = `debug-${trackName}-page.png`;
          await page.screenshot({ path: screenshotPath });
          console.log(`📸 Screenshot saved to ${screenshotPath}`);
          
          // Dump page HTML to analyze
          const pageHtml = await page.content();
          // Create a debug file to analyze the HTML
          const debugHtmlPath = `debug-${trackName}-html.txt`;
          fs.writeFileSync(debugHtmlPath, pageHtml);
          console.log(`📄 HTML saved to ${debugHtmlPath}`);
          
          // Let's try a much more direct approach focusing just on the textarea based on your screenshot
          console.log("Finding style description field with direct methods...");
          
          // First, try clicking directly where the text area should be
          console.log("Trying to click where the textarea should be...");
          
          // Super direct approach - focusing directly on elements from screenshot
          const editorFound = await page.evaluate(async (promptText) => {
            // Helper function for waiting in browser context
            const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            // Find potential clickable areas with descriptive text
            const styleDescriptionLabel = Array.from(document.querySelectorAll('div, span, label'))
              .find(el => el.textContent && el.textContent.includes('Style Description'));
              
            if (styleDescriptionLabel) {
              console.log("Found Style Description label, clicking it...");
              styleDescriptionLabel.click();
              await wait(500);
            }
            
            // Try to find any interactive elements resembling a text input
            const interactiveElements = [
              ...document.querySelectorAll('textarea'),
              ...document.querySelectorAll('div[contenteditable="true"]'),
              ...document.querySelectorAll('div[role="textbox"]'),
              ...document.querySelectorAll('div[class*="editor"]')
            ];
            
            // Log what we find
            console.log(`Found ${interactiveElements.length} potential interactive elements`);
            
            // Examine each and try to interact
            for (const element of interactiveElements) {
              try {
                // Check if this is likely our element
                element.click();
                await wait(200);
                
                // Try typing directly
                document.execCommand('insertText', false, promptText);
                
                // Check if it worked
                if (element.value === promptText || element.textContent.includes(promptText)) {
                  console.log("Successfully entered text using execCommand");
                  return true;
                }
                
                // Try setting value directly
                if (element.value !== undefined) {
                  element.value = promptText;
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  if (element.value === promptText) {
                    console.log("Successfully set value directly");
                    return true;
                  }
                }
                
                // Try setting innerText
                if (element.innerText !== undefined) {
                  element.innerText = promptText;
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  if (element.innerText.includes(promptText)) {
                    console.log("Successfully set innerText");
                    return true;
                  }
                }
              } catch (e) {
                console.log("Error with element:", e.message);
              }
            }
            
            return false;
          }, prompt);
          
          console.log(`Style description entered: ${editorFound}`);
          
          if (!editorFound) {
            // Last resort: try keyboard input
            console.log("Trying direct keyboard simulation...");
            
            // Find any element that might be clickable in the general area of the textarea
            await page.evaluate(() => {
              const elements = document.querySelectorAll('div, span');
              for (const el of elements) {
                const rect = el.getBoundingClientRect();
                // Target middle of the page, where text area likely is
                if (rect.top > 200 && rect.top < 400 && rect.width > 200) {
                  el.click();
                }
              }
            });
            
            await delay(500);
            
            // Try typing directly using keyboard
            await page.keyboard.type(prompt);
            console.log("Typed with keyboard simulation");
          }
          
          // Continue with the rest of the process
          console.log("Setting instrumental mode...");
          await page.evaluate(() => {
            // Try to find the toggle switch
            const toggles = document.querySelectorAll('span[role="checkbox"], div[role="checkbox"], label, input[type="checkbox"]');
            
            for (const toggle of toggles) {
              if (toggle.textContent && toggle.textContent.includes('Instrumental')) {
                toggle.click();
                return;
              }
            }
            
            // Try finding it by position on screen (based on screenshot)
            const elements = document.querySelectorAll('*');
            for (const el of elements) {
              const rect = el.getBoundingClientRect();
              // Target upper area of the page where the toggle is
              if (rect.top > 50 && rect.top < 150 && rect.left > 200 && rect.left < 300) {
                el.click();
                return;
              }
            }
          });
          
          // Click the Create button
          console.log("Finding and clicking Create button...");
          const createButtonClicked = await page.evaluate(() => {
            // Find all buttons
            const buttons = document.querySelectorAll('button');
            
            // Look for a button with text "Create" - this is the one in your screenshot
            for (const button of buttons) {
              if (button.textContent && button.textContent.includes('Create')) {
                button.click();
                return true;
              }
            }
            
            // Try finding by position (at bottom of page)
            const elements = document.querySelectorAll('*');
            for (const el of elements) {
              const rect = el.getBoundingClientRect();
              // Look at the bottom of the page
              if (rect.bottom > window.innerHeight - 100 && rect.width > 100) {
                el.click();
                return true;
              }
            }
            
            return false;
          });
          
          console.log(`Create button clicked: ${createButtonClicked}`);
          
          // Wait for generation (2 minutes)
          console.log("Waiting 120 seconds for generation...");
          await delay(120000);
          
          // Navigate to library to download
          console.log("Navigating to library...");
          await page.goto("https://suno.com/library?liked=true", { 
            waitUntil: "networkidle2",
            timeout: 60000
          });
          
          // Wait for library to load
          console.log("Waiting for library to load...");
          await delay(10000);
          
          // Take screenshot to see library
          const libraryScreenshot = `debug-${trackName}-library.png`;
          await page.screenshot({ path: libraryScreenshot });
          console.log(`📸 Library screenshot saved to ${libraryScreenshot}`);
          
          // Try to find and click the track's menu button
          console.log("Looking for track in library...");
          const trackFound = await page.evaluate((trackNameToFind) => {
            // Click any button in the first card
            const cards = document.querySelectorAll('.chakra-card');
            if (cards.length > 0) {
              const buttons = cards[0].querySelectorAll('button');
              if (buttons.length > 0) {
                // Usually the last button is the menu
                buttons[buttons.length - 1].click();
                return true;
              }
            }
            return false;
          }, trackName);
          
          if (!trackFound) {
            console.warn(`⚠️ Could not find track in library. Moving to next track.`);
            continue;
          }
          
          // Wait for menu to appear
          await delay(1000);
          
          // Click Download
          console.log("Clicking Download option...");
          await page.evaluate(() => {
            const menuItems = document.querySelectorAll('[role="menuitem"]');
            for (const item of menuItems) {
              if (item.textContent && item.textContent.includes('Download')) {
                item.click();
                return true;
              }
            }
            return false;
          });
          
          // Wait for submenu
          await delay(1000);
          
          // Click MP3
          console.log("Clicking MP3 option...");
          await page.evaluate(() => {
            const menuItems = document.querySelectorAll('[role="menuitem"]');
            for (const item of menuItems) {
              if (item.textContent && item.textContent.includes('MP3')) {
                item.click();
                return true;
              }
            }
            return false;
          });
          
          console.log(`⬇️ Download triggered for: ${trackName}`);
          
          // Wait for download
          console.log("Waiting 30 seconds for download...");
          await delay(30000);
          
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
