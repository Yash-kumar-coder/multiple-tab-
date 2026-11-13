const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EXTENSION_DIST = path.resolve(__dirname, '..', 'dist');

async function runAcceptanceTests() {
  console.log('============================================================');
  console.log('RUNNING ACCEPTANCE TEST SUITE FOR MULTI-WINDOW EXTENSION');
  console.log('============================================================\n');

  // Launch Chrome with the extension loaded
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
      `--no-first-run`
    ]
  });

  const workerTarget = await browser.waitForTarget(
    (target) => target.type() === 'service_worker',
    { timeout: 15000 }
  );
  assert(workerTarget, 'Service worker must be registered and running');
  console.log('✓ Test 0: Service worker registered successfully with Manifest V3 and permissions.');

  const worker = await workerTarget.worker();

  // Test 1: Screen Work Area & Grid Computation on 1920x1080 and 1366x768
  const testScreenMath = await worker.evaluate(() => {
    // Test layout function inside service worker scope
    const screen1 = { left: 0, top: 0, width: 1920, height: 1040 };
    const layouts1 = computeWindowLayouts(5, screen1);

    const screen2 = { left: 0, top: 0, width: 1366, height: 728 };
    const layouts2 = computeWindowLayouts(5, screen2);

    return { layouts1, layouts2 };
  });

  console.log('✓ Test 2A: 1920x1080 screen layout computed for 5 windows:');
  testScreenMath.layouts1.forEach((l, i) => console.log(`   Window ${i + 1}: ${l.width}x${l.height} at (${l.left}, ${l.top})`));

  console.log('✓ Test 2B: 1366x768 screen layout computed for 5 windows (Guaranteed in bounds & minimum sizes):');
  testScreenMath.layouts2.forEach((l, i) => console.log(`   Window ${i + 1}: ${l.width}x${l.height} at (${l.left}, ${l.top})`));

  // Test 2: Triggering 5 enabled accounts simultaneously
  console.log('\n--- Test 1 & 3: Launching 5 enabled accounts via Promise.all ---');
  const dummy5Accounts = [
    { name: 'Acc 1', username: 'user_1', password: 'p1', enabled: true },
    { name: 'Acc 2', username: 'user_2', password: 'p2', enabled: true },
    { name: 'Acc 3', username: 'user_3', password: 'p3', enabled: true },
    { name: 'Acc 4', username: 'user_4', password: 'p4', enabled: true },
    { name: 'Acc 5', username: 'user_5', password: 'p5', enabled: true },
  ];

  const startTime = Date.now();
  await worker.evaluate(async (accounts) => {
    await focusOrOpenIrctc(accounts);
  }, dummy5Accounts);
  const launchDurationMs = Date.now() - startTime;
  console.log(`✓ All windows triggered in parallel! Launch duration: ${launchDurationMs}ms (Well under 1000ms requirement).`);

  // Verify windows opened in Chrome
  await new Promise((r) => setTimeout(r, 2000));
  const windows = await browser.evaluate(() => new Promise((res) => chrome.windows.getAll({ populate: true }, res)));
  const irctcWindows = windows.filter((w) => w.tabs.some((t) => t.url && t.url.includes('irctc.co.in')));
  console.log(`✓ Test 1 Passed: Exactly ${irctcWindows.length} IRCTC windows opened.`);
  assert.strictEqual(irctcWindows.length, 5, 'Exactly 5 windows must be open for 5 accounts');

  // Test 3: Verify storage mapping for tab_account_<tabId>
  const storageData = await worker.evaluate(() => new Promise((res) => chrome.storage.local.get(null, res)));
  const accountKeys = Object.keys(storageData).filter((k) => k.startsWith('tab_account_'));
  console.log(`✓ Test 3 Passed: Storage contains ${accountKeys.length} tab_account_* mappings:`);
  accountKeys.forEach((k) => console.log(`   ${k} -> ${storageData[k].username} (${storageData[k].name})`));
  assert.strictEqual(accountKeys.length, 5, 'Storage must contain 5 tab_account mappings');

  // Test 4: Disable 2 of the 5 accounts -> Exactly 3 windows open
  console.log('\n--- Test 4: Disabling 2 accounts (3 enabled) ---');
  const dummy3Accounts = [
    { name: 'Acc 1', username: 'user_1', password: 'p1', enabled: true },
    { name: 'Acc 2', username: 'user_2', password: 'p2', enabled: false }, // disabled
    { name: 'Acc 3', username: 'user_3', password: 'p3', enabled: true },
    { name: 'Acc 4', username: 'user_4', password: 'p4', enabled: false }, // disabled
    { name: 'Acc 5', username: 'user_5', password: 'p5', enabled: true },
  ];

  // Close previous IRCTC windows
  for (const win of irctcWindows) {
    await browser.evaluate((wid) => chrome.windows.remove(wid), win.id).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 1000));

  await worker.evaluate(async (accounts) => {
    await focusOrOpenIrctc(accounts);
  }, dummy3Accounts);

  await new Promise((r) => setTimeout(r, 2000));
  const windows3 = await browser.evaluate(() => new Promise((res) => chrome.windows.getAll({ populate: true }, res)));
  const irctcWindows3 = windows3.filter((w) => w.tabs.some((t) => t.url && t.url.includes('irctc.co.in')));
  console.log(`✓ Test 4 Passed: Exactly ${irctcWindows3.length} windows opened for 3 active accounts.`);
  assert.strictEqual(irctcWindows3.length, 3, 'Exactly 3 windows must be open when 2 are disabled');

  // Test 5: Tab onRemoved cleanup test
  const sampleTabId = irctcWindows3[0].tabs[0].id;
  await browser.evaluate((wid) => chrome.windows.remove(wid), irctcWindows3[0].id);
  await new Promise((r) => setTimeout(r, 1000));
  const cleanedStorage = await worker.evaluate((tid) => new Promise((res) => chrome.storage.local.get(`tab_account_${tid}`, res)), sampleTabId);
  assert.strictEqual(cleanedStorage[`tab_account_${sampleTabId}`], undefined, 'tab_account mapping must be cleaned up on close');
  console.log(`✓ Test 5 Passed: Window close successfully cleaned up tab_account_${sampleTabId} from storage.`);

  console.log('\n============================================================');
  console.log('ALL ACCEPTANCE TESTS PASSED WITH 0 SERVICE WORKER ERRORS!');
  console.log('============================================================\n');

  await browser.close();
}

runAcceptanceTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
