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
  console.log("🚀 STARTING AUTOMATION - UPDATED FOR NEW SUNO INTERFACE");
  
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
          
          // Wait for page to load
          console.log("Waiting for page to load...");
          await delay(5000);
          
          // Using the style description field from the screenshot
          console.log("Finding style description field...");
          
          // Find and click in the text area based on the screenshot
          const styleDescriptionEntered = await page.evaluate((promptText) => {
            // Try to find various possible containers for the text field
            const possibleContainers = [
              document.querySelector('[data-testid="style-description"]'),
              document.querySelector('div[contenteditable="true"]'),
              document.querySelector('div[role="textbox"]'),
              document.querySelector('.chakra-textarea')
            ];
            
            // Get all contenteditable divs as fallback
            const editableDivs = document.querySelectorAll('[contenteditable="true"]');
            if (editableDivs.length > 0) {
              // Log all contenteditable divs
              console.log(`Found ${editableDivs.length} contenteditable divs`);
            }
            
            // Find textareas as another fallback
            const textareas = document.querySelectorAll('textarea');
            if (textareas.length > 0) {
              console.log(`Found ${textareas.length} textareas`);
              for (let i = 0; i < textareas.length; i++) {
                console.log(`Textarea ${i} placeholder: ${textareas[i].placeholder}`);
                if (textareas[i].placeholder && textareas[i].placeholder.toLowerCase().includes('style description')) {
                  textareas[i].value = promptText;
                  textareas[i].dispatchEvent(new Event('input', { bubbles: true }));
                  return true;
                }
              }
            }
            
            // Try to find direct placeholder text with "Enter style description"
            const allElements = document.querySelectorAll('*');
            for (const element of allElements) {
              if (element.placeholder && element.placeholder.includes('Enter style description')) {
                console.log('Found element with placeholder "Enter style description"');
                element.value = promptText;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
            }
            
            // As a last resort, try to find the input field by its visible label
            const labels = document.querySelectorAll('label, div, span');
            for (const label of labels) {
              if (label.textContent && label.textContent.includes('Style Description')) {
                // Look for an input field near this label
                const input = label.nextElementSibling || 
                              label.parentElement.querySelector('input, textarea, [contenteditable="true"]');
                if (input) {
                  if (input.value !== undefined) {
                    input.value = promptText;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  } else if (input.textContent !== undefined) {
                    input.textContent = promptText;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                  return true;
                }
              }
            }
            
            return false;
          }, prompt);
          
          console.log(`Style description entered: ${styleDescriptionEntered}`);
          
          if (!styleDescriptionEntered) {
            console.log("Could not find style description field. Taking screenshot for debugging...");
            await page.screenshot({ path: 'suno-create-page.png' });
            throw new Error("Could not find style description field");
          }
          
          // Toggle "Instrumental" if it's not already selected
          console.log("Setting instrumental mode...");
          await page.evaluate(() => {
            const switchElement = document.querySelector('span[role="checkbox"]');
            if (switchElement) {
              const isChecked = switchElement.getAttribute('aria-checked') === 'true';
              if (!isChecked) {
                switchElement.click();
              }
            }
          });
          
          // Set the track name
          console.log("Setting track name...");
          
          // Expand "More Options" if needed
          await page.evaluate(() => {
            const moreOptionsButton = Array.from(document.querySelectorAll('button, div')).find(
              el => el.textContent && el.textContent.includes('More Options')
            );
            
            if (moreOptionsButton) {
              moreOptionsButton.click();
            }
          });
          
          // Wait for More Options to expand
          await delay(1000);
          
          // Set song title
          const songTitleSet = await page.evaluate((trackName) => {
            const titleInput = document.querySelector('input[placeholder="Enter song title"]');
            if (titleInput) {
              titleInput.value = trackName;
              titleInput.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
            return false;
          }, trackName);
          
          console.log(`Song title set: ${songTitleSet}`);
          
          // Find the Create button (from screenshot it's the button with "Create" text)
          console.log("Clicking Create button...");
          const createClicked = await page.evaluate(() => {
            // Look for button with text "Create"
            const createButtons = Array.from(document.querySelectorAll('button')).filter(
              button => button.textContent && button.textContent.includes('Create')
            );
            
            if (createButtons.length > 0) {
              // Click the button that looks like the main Create button
              // This is likely to be the one with the most styling/classes
              let mainButton = createButtons[0];
              for (const button of createButtons) {
                if (button.classList.length > mainButton.classList.length) {
                  mainButton = button;
                }
              }
              
              mainButton.click();
              return true;
            }
            
            return false;
          });
          
          if (!createClicked) {
            console.log("Could not find Create button. Taking screenshot for debugging...");
            await page.screenshot({ path: 'suno-create-button.png' });
            throw new Error("Could not find Create button");
          }
          
          console.log(`⏳ Waiting for track generation: ${trackName}`);
          
          // Wait for generation to complete (2 minutes)
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
          await delay(5000);
          
          // Find and click the track's menu button
          console.log("Looking for track in library...");
          const menuClicked = await page.evaluate((trackName) => {
            // Find all track cards
            const allCards = document.querySelectorAll('.chakra-card');
            console.log(`Found ${allCards.length} cards in library`);
            
            // Function to find the menu button in a card
            const findMenuButton = (card) => {
              // Look for menu button (likely a button with an icon)
              const buttons = card.querySelectorAll('button');
              // Last button is often the menu button
              if (buttons.length > 0) {
                return buttons[buttons.length - 1];
              }
              return null;
            };
            
            // Look for exact track name match
            for (const card of allCards) {
              if (card.textContent.includes(trackName)) {
                const menuButton = findMenuButton(card);
                if (menuButton) {
                  menuButton.click();
                  return true;
                }
              }
            }
            
            // If exact match fails, look for partial match
            const trackNameParts = trackName.split('-');
            if (trackNameParts.length > 0) {
              const mainPart = trackNameParts[0];
              for (const card of allCards) {
                if (card.textContent.includes(mainPart)) {
                  const menuButton = findMenuButton(card);
                  if (menuButton) {
                    menuButton.click();
                    return true;
                  }
                }
              }
            }
            
            // Last resort - just click the first menu button found
            if (allCards.length > 0) {
              const firstCard = allCards[0];
              const menuButton = findMenuButton(firstCard);
              if (menuButton) {
                menuButton.click();
                return true;
              }
            }
            
            return false;
          }, trackName);
          
          if (!menuClicked) {
            console.log("Could not find menu button. Taking screenshot for debugging...");
            await page.screenshot({ path: 'suno-library.png' });
            throw new Error("Could not find menu button for track");
          }
          
          // Wait for menu to appear
          await delay(1000);
          
          // Click "Download" in menu
          console.log("Clicking Download option...");
          const downloadClicked = await page.evaluate(() => {
            // Find all menu items
            const menuItems = document.querySelectorAll('[role="menuitem"]');
            
            // Look for Download option
            for (const item of menuItems) {
              if (item.textContent.includes('Download')) {
                item.click();
                return true;
              }
            }
            
            return false;
          });
          
          if (!downloadClicked) {
            console.log("Could not find Download option. Taking screenshot for debugging...");
            await page.screenshot({ path: 'suno-menu.png' });
            throw new Error("Could not find Download option");
          }
          
          // Wait for submenu
          await delay(1000);
          
          // Click MP3 option
          console.log("Clicking MP3 Audio option...");
          const mp3Clicked = await page.evaluate(() => {
            // Find all menu items (in the submenu)
            const menuItems = document.querySelectorAll('[role="menuitem"]');
            
            // Look for MP3 option
            for (const item of menuItems) {
              if (item.textContent.includes('MP3')) {
                item.click();
                return true;
              }
            }
            
            return false;
          });
          
          if (!mp3Clicked) {
            console.log("Could not find MP3 option. Taking screenshot for debugging...");
            await page.screenshot({ path: 'suno-submenu.png' });
            throw new Error("Could not find MP3 option");
          }
          
          console.log(`⬇️ Download triggered: ${trackName}`);
          
          // Wait for download to complete
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
