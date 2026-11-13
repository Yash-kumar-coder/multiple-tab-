// src/scripts/sessionManager.js
// This helper runs in the background service worker (sw.js) to manage multiple IRCTC sessions.
// It creates a tab for each account configuration, injects the main automation script,
// and tracks completion status via runtime messages.

/**
 * Load stored accounts from chrome.storage.local.
 * Expected schema: { accounts: [{ id, name, username, encryptedPassword, proxy? }, ...] }
 */
function loadAccounts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['accounts'], (result) => {
      resolve(result.accounts || []);
    });
  });
}

/** Decrypt the stored password using the utility in utils/crypto.js (executed in the tab).
 * The decryption is performed client‑side inside the content script, because background
 * workers cannot access SubtleCrypto in the same way. We therefore pass the encrypted
 * object to the content script which will decrypt it before use.
 */

/** Create a tab for a given account and start automation. */
async function startSession(account) {
  // Open IRCTC homepage in a background tab (inactive).
  const tab = await new Promise((resolve) => {
    chrome.tabs.create({ url: 'https://www.irctc.co.in/nget/train-search', active: false }, (t) => resolve(t));
  });

  // Store session-specific data in chrome.storage.session scoped to this tab.
  const sessionKey = `session_${account.id}`;
  const sessionData = {
    accountId: account.id,
    username: account.username,
    encryptedPassword: account.encryptedPassword,
    proxy: account.proxy || null,
  };
  // Use the session storage API – it is per‑origin, but we namespace keys.
  chrome.storage.session.set({ [sessionKey]: sessionData }, () => {
    // No callback needed.
  });

  // Inject the automation entry point. We pass the session key as an argument so the
  // content script can retrieve its configuration.
  await new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ['src/scripts/main-script.js'],
        // The script will read `chrome.storage.session.get(sessionKey)` on load.
        // We also set a small init script to expose the key.
        world: 'MAIN',
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) reject(err);
        else resolve();
      },
    );
  });

  // Keep track of active sessions.
  activeSessions[account.id] = { tabId: tab.id, status: 'running' };
}

/** Global map of running sessions (in‑memory, reset on reload). */
const activeSessions = {};

/** Handle messages from content scripts reporting progress or completion. */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'sessionStatus') {
    const { accountId, status, details } = message;
    if (activeSessions[accountId]) {
      activeSessions[accountId].status = status;
      activeSessions[accountId].details = details;
    }
    // Optionally close the tab on success/failure.
    if (status === 'completed' || status === 'error') {
      const { tabId } = activeSessions[accountId] || {};
      if (tabId) {
        chrome.tabs.remove(tabId);
      }
      delete activeSessions[accountId];
    }
    // Echo back acknowledgment.
    sendResponse({ received: true });
    return true; // keep channel open for async response
  }
  return false;
});

/** Entry point invoked by sw.js when the scheduled alarm fires. */
async function startAllSessions() {
  const accounts = await loadAccounts();
  if (!accounts.length) {
    console.warn('No accounts configured for multi‑session automation');
    return;
  }
  // Launch each account in parallel (do not await inside loop).
  accounts.forEach((acc) => {
    startSession(acc).catch((e) => console.error('Failed to start session', acc.id, e));
  });
}

// Export for sw.js to call.
if (typeof module !== 'undefined') {
  module.exports = { startAllSessions, activeSessions };
}
