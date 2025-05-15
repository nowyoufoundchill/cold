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
  console.log("🚀 STARTING DETECTION-BYPASS AUTOMATION");
  
  // Manual delay function
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    await ensureAudioFolder();
    
    // Get cookie from environment
    const SUNO_COOKIE = process.env.SUNO_COOKIE;
    if (!SUNO_COOKIE) {
      throw new Error("SUNO_COOKIE not provided");
    }

    // Launch browser with more permissive settings and additional configuration
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-features=BlockInsecurePrivateNetworkRequests",
        "--disable-features=PrivateNetworkAccessPermissionPrompt",
        "--disable-features=PrivateNetworkAccessRespectPreflightResults",
        "--disable-blink-features=AutomationControlled", // Attempt to avoid bot detection
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36" // Use a common user agent
      ],
      executablePath: puppeteer.executablePath(),
    });

    // Create new page
    const page = await browser.newPage();
    
    // Set longer default navigation timeout
    page.setDefaultNavigationTimeout(60000);
    
    // Additional anti-detection measures
    await page.evaluateOnNewDocument(() => {
      // Overwrite navigator properties used for bot detection
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      // Overwrite webgl fingerprinting
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris Pro Graphics';
        }
        return getParameter.apply(this, arguments);
      };
    });
    
    // Log console messages from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // First, visit the main Suno site to establish a legitimate session
    console.log("Visiting main Suno site to establish session...");
    await page.goto("https://suno.com", { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    
    await delay(5000);
    
    // Set cookies with proper domain and authentication
    console.log("Setting authentication cookies...");
    await page.setCookie({
      name: "session",
      value: SUNO_COOKIE,
      domain: ".suno.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None"
    });
    
    // Add additional possible cookies that might be needed
    const additionalCookies = [
      {
        name: "sessionid",
        value: SUNO_COOKIE,
        domain: ".suno.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None"
      },
      {
        name: "auth",
        value: SUNO_COOKIE,
        domain: ".suno.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None"
      }
    ];
    
    await page.setCookie(...additionalCookies);
    
    // Verify authentication
    console.log("Verifying authentication...");
    await page.goto("https://suno.com/library", { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    
    await delay(5000);
    
    // Check if we're authenticated properly
    const isAuthenticated = await page.evaluate(() => {
      // Check for signs of being authenticated
      return !document.body.textContent.includes('Sign in') && 
             !document.body.textContent.includes('Log in');
    });
    
    if (!isAuthenticated) {
      console.warn("⚠️ Authentication may not be working correctly. Attempting to proceed anyway.");
    } else {
      console.log("✅ Authentication verified");
    }
    
    // Process each prompt
    for (const prompt of prompts) {
      const slug = slugify(prompt);
      
      // Generate 2 tracks per prompt
      for (let i = 1; i <= 2; i++) {
        const trackName = `${slug}-Track${i}`;
        console.log(`🎼 Generating: ${trackName}`);
        
        try {
          // Navigate to create page - with a different approach to avoid detection
          console.log("Navigating to create page...");
          
          // First go to home, then navigate to create
          await page.goto("https://suno.com", { 
            waitUntil: "networkidle2", 
            timeout: 60000 
          });
          
          await delay(2000);
          
          // Now navigate to create via clicking (more natural)
          await page.evaluate(() => {
            // Find create link/button
            const createLinks = Array.from(document.querySelectorAll('a')).filter(a => 
              a.textContent.toLowerCase().includes('create') || 
              a.href.includes('/create')
            );
            
            if (createLinks.length > 0) {
              createLinks[0].click();
              return true;
            }
            
            // If that doesn't work, try going directly to the URL
            window.location.href = 'https://suno.com/create?wid=default';
            return false;
          });
          
          // Wait longer for page to load
          console.log("Waiting 15 seconds for page to fully load...");
          await delay(15000);
          
          // Take screenshot to see what we're working with
          const screenshotPath = `debug-${trackName}-page.png`;
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`📸 Screenshot saved to ${screenshotPath}`);
          
          // Now interact with the page using a different approach
          const pageActions = await page.evaluate(async (promptText, trackNameInput) => {
            // Helper function for waiting in browser context
            const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const results = { actions: [] };
            
            try {
              // Step 1: Select instrumental mode
              const instrumental = document.querySelector('input[type="checkbox"]') || 
                                 document.querySelector('[role="checkbox"]');
              if (instrumental) {
                instrumental.click();
                results.actions.push("Clicked instrumental checkbox");
                await wait(500);
              }
              
              // Step 2: Find any editable field and enter the prompt
              const textContainers = [
                ...document.querySelectorAll('textarea'),
                ...document.querySelectorAll('[contenteditable="true"]'),
                ...document.querySelectorAll('[role="textbox"]'),
                ...document.querySelectorAll('[placeholder*="style"]'),
                ...document.querySelectorAll('[placeholder*="description"]')
              ];
              
              results.foundTextContainers = textContainers.length;
              let textEntered = false;
              
              // Try each container
              for (const container of textContainers) {
                try {
                  // Try multiple ways to enter text
                  container.focus();
                  await wait(200);
                  
                  // Method 1: Set value directly
                  if (container.value !== undefined) {
                    container.value = promptText;
                    container.dispatchEvent(new Event('input', { bubbles: true }));
                    results.actions.push("Set value directly");
                  }
                  // Method 2: Set innerText
                  else if (container.innerText !== undefined) {
                    container.innerText = promptText;
                    container.dispatchEvent(new Event('input', { bubbles: true }));
                    results.actions.push("Set innerText");
                  }
                  // Method 3: execCommand
                  else {
                    document.execCommand('insertText', false, promptText);
                    results.actions.push("Used execCommand");
                  }
                  
                  textEntered = true;
                  break;
                } catch (e) {
                  results.actions.push(`Error with container: ${e.message}`);
                }
              }
              
              // If nothing worked, try clicking in the middle of the page and typing
              if (!textEntered) {
                // Find a div in the middle of the page
                const allDivs = document.querySelectorAll('div');
                const middleDivs = Array.from(allDivs).filter(div => {
                  const rect = div.getBoundingClientRect();
                  return rect.top > 200 && rect.top < 400 && rect.width > 300;
                });
                
                if (middleDivs.length > 0) {
                  middleDivs[0].click();
                  await wait(200);
                  results.actions.push("Clicked middle div");
                }
              }
              
              // Step 3: Set track title 
              // First, try to open more options if needed
              const moreOptions = Array.from(document.querySelectorAll('div, button'))
                .find(el => el.textContent && el.textContent.includes('More Options'));
                
              if (moreOptions) {
                moreOptions.click();
                await wait(500);
                results.actions.push("Clicked More Options");
              }
              
              // Now look for title input
              const titleInputs = document.querySelectorAll('input[type="text"], input[placeholder*="title"]');
              if (titleInputs.length > 0) {
                titleInputs[0].value = trackNameInput;
                titleInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                results.actions.push("Set track title");
              }
              
              // Step 4: Generate/Create button
              await wait(500);
              
              // Look for a button with text "Create" or "Generate"
              const generateButtons = Array.from(document.querySelectorAll('button')).filter(button => 
                button.textContent && (
                  button.textContent.includes('Create') || 
                  button.textContent.includes('Generate')
                )
              );
              
              let buttonClicked = false;
              if (generateButtons.length > 0) {
                generateButtons[0].click();
                buttonClicked = true;
                results.actions.push("Clicked Generate/Create button");
              }
              
              // If no button found, try to find one at the bottom of the page
              if (!buttonClicked) {
                const buttons = document.querySelectorAll('button');
                const bottomButtons = Array.from(buttons).filter(button => {
                  const rect = button.getBoundingClientRect();
                  return rect.bottom > window.innerHeight - 150;
                });
                
                if (bottomButtons.length > 0) {
                  bottomButtons[0].click();
                  buttonClicked = true;
                  results.actions.push("Clicked bottom button");
                }
              }
              
              return results;
            } catch (e) {
              return { error: e.message, actions: results.actions || [] };
            }
          }, prompt, trackName);
          
          console.log("Page actions:", pageActions);
          
          // Wait for generation (2 minutes)
          console.log("Waiting 120 seconds for generation...");
          await delay(120000);
          
          // Navigate to library to download
          console.log("Navigating to library...");
          await page.goto("https://suno.com/library", { 
            waitUntil: "networkidle2",
            timeout: 60000
          });
          
          // Wait for library to load
          console.log("Waiting for library to load...");
          await delay(10000);
          
          // Take screenshot to see library
          const libraryScreenshot = `debug-${trackName}-library.png`;
          await page.screenshot({ path: libraryScreenshot, fullPage: true });
          console.log(`📸 Library screenshot saved to ${libraryScreenshot}`);
          
          // Try to find and click the track's menu button
          console.log("Looking for tracks in library...");
          
          const libraryActions = await page.evaluate(() => {
            const results = { actions: [] };
            
            // Find all cards
            const cards = document.querySelectorAll('.chakra-card');
            results.cardsFound = cards.length;
            
            if (cards.length === 0) {
              results.actions.push("No cards found in library");
              return results;
            }
            
            // Click menu on the first card
            const firstCard = cards[0];
            const buttons = firstCard.querySelectorAll('button');
            
            if (buttons.length === 0) {
              results.actions.push("No buttons found in first card");
              return results;
            }
            
            // Usually the last button is the menu button
            const lastButton = buttons[buttons.length - 1];
            lastButton.click();
            results.actions.push("Clicked menu button on first card");
            
            return results;
          });
          
          console.log("Library actions:", libraryActions);
          
          // Wait for menu to appear
          await delay(1000);
          
          // Click Download
          console.log("Clicking Download option...");
          await page.evaluate(() => {
            // Find all menu items
            const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], .chakra-menu__menuitem'));
            
            // Find Download option
            const downloadItem = menuItems.find(item => 
              item.textContent && item.textContent.includes('Download')
            );
            
            if (downloadItem) {
              downloadItem.click();
              return true;
            }
            
            return false;
          });
          
          // Wait for submenu
          await delay(1000);
          
          // Click MP3
          console.log("Clicking MP3 option...");
          await page.evaluate(() => {
            // Find all menu items
            const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], .chakra-menu__menuitem'));
            
            // Find MP3 option
            const mp3Item = menuItems.find(item => 
              item.textContent && item.textContent.includes('MP3')
            );
            
            if (mp3Item) {
              mp3Item.click();
              return true;
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
