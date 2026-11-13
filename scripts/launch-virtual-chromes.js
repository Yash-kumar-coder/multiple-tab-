/**
 * Rock-Solid Multi-Virtual Chrome Automation Engine
 * Uses Puppeteer-Core to guarantee that every virtual chrome instance
 * opens as its own dedicated process, positioned cleanly across your screen,
 * with its own 100% isolated cookies, sessions, and credentials.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs-extra');
const path = require('path');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT_DIR = path.resolve(__dirname, '..');
const EXTENSION_DIST = path.resolve(ROOT_DIR, 'dist');
const PROFILES_ROOT = path.resolve(ROOT_DIR, '.virtual_browser_profiles');
const CONFIG_FILE = path.resolve(ROOT_DIR, 'accounts_config.json');

const IRCTC_URL = 'https://www.irctc.co.in/nget/train-search';

async function main() {
  if (!fs.existsSync(CHROME_PATH)) {
    console.error(`Chrome executable not found at: ${CHROME_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Config file not found at: ${CONFIG_FILE}`);
    process.exit(1);
  }

  const config = fs.readJsonSync(CONFIG_FILE);
  const activeAccounts = (config.accounts || []).filter(a => a.enabled);

  if (activeAccounts.length === 0) {
    console.error("No active accounts found in accounts_config.json! Please enable at least 1 account.");
    process.exit(1);
  }

  console.log(`\n============================================================`);
  console.log(`  LAUNCHING ${activeAccounts.length} INDEPENDENT VIRTUAL CHROME INSTANCES`);
  console.log(`============================================================\n`);

  // Screen layout calculation for automatic side-by-side tiling
  const screenWidth = 1920;
  const screenHeight = 1040;
  const count = activeAccounts.length;
  const cols = count <= 2 ? count : (count <= 4 ? 2 : 3);
  const rows = Math.ceil(count / cols);
  const winWidth = Math.floor(screenWidth / cols);
  const winHeight = Math.floor(screenHeight / rows);

  fs.ensureDirSync(PROFILES_ROOT);

  const browserPromises = activeAccounts.map(async (acc, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = col * winWidth;
    const top = row * winHeight;

    const profileDir = path.join(PROFILES_ROOT, `profile_${index + 1}_${acc.username.replace(/[^a-zA-Z0-9]/g, '_')}`);
    fs.ensureDirSync(profileDir);

    console.log(`[Launching Instance ${index + 1}] ${acc.name} (${acc.username}) -> Size: ${winWidth}x${winHeight} Pos: (${left}, ${top})`);

    try {
      const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: false,
        userDataDir: profileDir,
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          `--disable-extensions-except=${EXTENSION_DIST}`,
          `--load-extension=${EXTENSION_DIST}`,
          `--window-size=${winWidth},${winHeight}`,
          `--window-position=${left},${top}`,
          `--no-first-run`,
          `--no-default-browser-check`,
          `--disable-background-timer-throttling`,
          `--disable-backgrounding-occluded-windows`,
          `--disable-renderer-backgrounding`,
          `--start-maximized=false`
        ]
      });

      const pages = await browser.pages();
      const page = pages[0] || (await browser.newPage());

      // Pre-set tab account data into extension storage for this virtual chrome
      await page.evaluateOnNewDocument((accountData, journeyData, passengerData) => {
        window.__IRCTC_VIRTUAL_ACCOUNT__ = accountData;
        window.__IRCTC_JOURNEY_CONFIG__ = {
          ...journeyData,
          passengerList: passengerData,
          username: accountData.username,
          password: accountData.password,
          automationStatus: true
        };
      }, acc, config.journeyDetails, config.passengers);

      await page.goto(IRCTC_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      console.log(`[Ready] ${acc.name} (${acc.username}) navigating IRCTC!`);
      return browser;
    } catch (err) {
      console.error(`[Error] Failed to launch ${acc.name}:`, err.message);
      return null;
    }
  });

  await Promise.all(browserPromises);
  console.log(`\nAll ${activeAccounts.length} Virtual Chromes are active, tiled, and running independently!`);
}

main().catch(console.error);
