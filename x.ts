// Import necessary modules
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio'; // Corrected import statement
import fs from 'fs'; // Import filesystem module for saving and loading cookies
import fetch from 'node-fetch'; // Import fetch for sending webhook

// Add the stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

// Your X.com login credentials
const USERNAME = 'uname';
const PASSWORD = 'pw';

// Path to the cookies file
const COOKIES_PATH = './cookies.json';
const LAST_TEXT_PATH = './lasttext';

// Discord webhook URL
const WEBHOOK_URL = 'hookywooky';

(async () => {
  // Launch Puppeteer with the stealth plugin enabled
  const browser = await puppeteer.launch({
    headless: true, // Set to false to see the browser actions
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Set a realistic user agent to mimic a real browser
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36'
  );

  try {
    // Load cookies if they exist
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
      await page.setCookie(...cookies);
      console.log('Cookies loaded from file');
    }

    // Attempt to navigate to the X.com login page
    await page.goto('https://x.com/login', { waitUntil: 'networkidle2' });

    try {
      // Try waiting for the username input field (if the login is needed)
      await page.waitForSelector('input[name="text"]', { visible: true, timeout: 5000 });
      console.log('Login required. Proceeding with login.');

      // Enter the username
      await page.type('input[name="text"]', USERNAME, { delay: 100 });
      await page.keyboard.press('Enter');

      // Wait for the password input field and enter the password
      await page.waitForSelector('input[name="password"]', { visible: true, timeout: 5000 });
      await page.type('input[name="password"]', PASSWORD, { delay: 100 });
      await page.keyboard.press('Enter');

      // Wait for navigation after login
      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      // Save cookies after login
      const cookies = await page.cookies();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
      console.log('Cookies saved to file');
    } catch (error) {
      if (error.name === 'TimeoutError') {
        console.log('Login not required, proceeding to /with_replies.');
      } else {
        throw error; // Re-throw if it's a different error
      }
    }

    // Navigate to the target page
    await page.goto('https://x.com/MKBRL05/with_replies', { waitUntil: 'networkidle2' });

    // Wait for the content to load
    await page.waitForSelector('article', { timeout: 10000 });

    // Extract the page content
    const content = await page.content();

    // Load the content into Cheerio for parsing
    const $ = cheerio.load(content);

    // Find the first occurrence of the status link
    const firstStatusLink = $('a[href^="/MKBRL05/status/"]').first();

    if (firstStatusLink.length > 0) {
      // Get the href attribute to extract the full path of the status link
      const statusPath = firstStatusLink.attr('href');

      // Construct the full URL to the tweet by appending it to the base URL
      const tweetUrl = `https://x.com${statusPath}`;

      // Traverse up to the closest article element to find tweet content
      const article = firstStatusLink.closest('article');

      if (article.length > 0) {
        // Find the tweet text within the article
        const tweetTextElement = article.find('[data-testid="tweetText"]');
        const tweetText = tweetTextElement.text().trim();

        // Read the last tweet content from the file if it exists
        const lastText = fs.existsSync(LAST_TEXT_PATH)
          ? fs.readFileSync(LAST_TEXT_PATH, 'utf8')
          : '';

        if (tweetText !== lastText) {
          // Format the content as a hyperlink for Discord
          const content = `[${tweetText}](${tweetUrl})`;

          // Send the hyperlink to the Discord webhook
          await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content }),
          });
          console.log('Tweet content sent to Discord webhook as a hyperlink.');

          // Save the new tweet content to the file
          fs.writeFileSync(LAST_TEXT_PATH, tweetText);
        } else {
          console.log('Tweet content is the same as the last one, not sending webhook.');
        }
      } else {
        console.log('Article element not found');
      }
    } else {
      console.log('No status link found');
    }
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    // Close the browser
    await browser.close();
  }
})();
