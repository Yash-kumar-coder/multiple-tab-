const STORAGE_KEY = 'tatkalTicketBookingFormData';
const BOOKING_ALARM = 'tatkal-booking-warmup';
const BOOKING_NOTIFICATION = 'tatkal-booking-notification';
const IRCTC_URL = 'https://www.irctc.co.in/nget/train-search';
const IST_OFFSET = '+05:30';

const getScheduledDateTime = (scheduleDate, targetTime) => {
  if (!scheduleDate || !targetTime) {
    return null;
  }

  const scheduledDateTime = new Date(`${scheduleDate}T${targetTime}${IST_OFFSET}`);
  return Number.isNaN(scheduledDateTime.getTime()) ? null : scheduledDateTime;
};

const getLoginDateTime = (settings) => {
  const scheduledDateTime = getScheduledDateTime(
    settings?.scheduleDate,
    settings?.targetTime
  );

  if (!scheduledDateTime) {
    return null;
  }

  return new Date(
    scheduledDateTime.getTime() - Number(settings?.loginMinutesBefore || 0) * 60 * 1000
  );
};

const getJourneySummary = (settings) => {
  const parts = [settings?.trainNumber, settings?.from, settings?.to].filter(Boolean);
  return parts.length ? parts.join(' ') : 'your booking';
};

const getSettings = async () => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result?.[STORAGE_KEY] || null;
};

/**
 * Reads display information using chrome.system.display API.
 * Falls back safely to standard workArea if unavailable.
 */
const getPrimaryDisplayWorkArea = async () => {
  try {
    if (chrome?.system?.display?.getInfo) {
      const displays = await chrome.system.display.getInfo();
      if (Array.isArray(displays) && displays.length > 0) {
        const primary = displays.find((d) => d.isPrimary) || displays[0];
        if (primary?.workArea) {
          return primary.workArea; // { left, top, width, height }
        }
        if (primary?.bounds) {
          return primary.bounds;
        }
      }
    }
  } catch (err) {
    console.warn('[SW] Could not query chrome.system.display:', err);
  }
  // Safe default work area
  return { left: 0, top: 0, width: 1366, height: 728 };
};

/**
 * Computes grid layout bounds for N windows within display work area.
 * Clamps every window to minimum 480x360 and guarantees 100% fits on screen.
 * Falls back to cascading if screen is too small for grid.
 */
const computeWindowLayouts = (count, workArea) => {
  const MIN_WIDTH = 480;
  const MIN_HEIGHT = 360;

  const areaLeft = workArea.left || 0;
  const areaTop = workArea.top || 0;
  const areaWidth = workArea.width || 1366;
  const areaHeight = workArea.height || 728;

  // Determine grid dimensions
  let cols = 1;
  let rows = 1;

  if (count === 1) {
    cols = 1;
    rows = 1;
  } else if (count === 2) {
    cols = 2;
    rows = 1;
  } else if (count <= 4) {
    cols = 2;
    rows = 2;
  } else if (count <= 6) {
    cols = 3;
    rows = 2;
  } else {
    cols = Math.ceil(Math.sqrt(count));
    rows = Math.ceil(count / cols);
  }

  const slotWidth = Math.floor(areaWidth / cols);
  const slotHeight = Math.floor(areaHeight / rows);

  // If grid slots are smaller than minimum allowed dimensions, fallback to cascading
  const useCascade = slotWidth < MIN_WIDTH || slotHeight < MIN_HEIGHT;

  const layouts = [];

  for (let index = 0; index < count; index++) {
    if (useCascade) {
      const cascadeWidth = Math.min(Math.max(areaWidth - 100, MIN_WIDTH), 900);
      const cascadeHeight = Math.min(Math.max(areaHeight - 100, MIN_HEIGHT), 700);
      const offset = (index * 30) % Math.max(areaHeight - cascadeHeight, 30);
      const left = Math.min(areaLeft + offset, areaLeft + areaWidth - cascadeWidth);
      const top = Math.min(areaTop + offset, areaTop + areaHeight - cascadeHeight);

      layouts.push({
        width: Math.floor(cascadeWidth),
        height: Math.floor(cascadeHeight),
        left: Math.floor(left),
        top: Math.floor(top),
      });
    } else {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const left = areaLeft + col * slotWidth;
      const top = areaTop + row * slotHeight;
      const width = slotWidth;
      const height = slotHeight;

      layouts.push({
        width: Math.floor(width),
        height: Math.floor(height),
        left: Math.floor(left),
        top: Math.floor(top),
      });
    }
  }

  return layouts;
};

/**
 * Creates a browser window for a specific account.
 * Validates bounds, retries with safe cascade bounds on error, and maps tabId to account.
 */
const createAccountWindow = async (account, layout, safeCascadeLayout) => {
  const launchOnce = (bounds) => {
    return new Promise((resolve, reject) => {
      chrome.windows.create(
        {
          url: IRCTC_URL,
          type: 'normal',
          width: bounds.width,
          height: bounds.height,
          left: bounds.left,
          top: bounds.top,
          focused: true,
        },
        (win) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!win) {
            reject(new Error('Window creation returned undefined'));
          } else {
            resolve(win);
          }
        }
      );
    });
  };

  let win = null;
  try {
    win = await launchOnce(layout);
  } catch (initialErr) {
    console.warn(`[SW] Initial window create failed for ${account.name || account.username}:`, initialErr.message, 'Retrying with safe bounds...');
    try {
      win = await launchOnce(safeCascadeLayout);
    } catch (retryErr) {
      console.error(`[SW] Retry window create failed for ${account.name || account.username}:`, retryErr.message);
      return { success: false, account, error: retryErr.message };
    }
  }

  const tab = win?.tabs?.[0];
  if (tab?.id) {
    // Save per-window account isolation mapping
    await chrome.storage.local.set({
      [`tab_account_${tab.id}`]: {
        name: account.name,
        username: account.username,
        password: account.password,
      },
    });
  }

  return { success: true, account, windowId: win.id, tabId: tab?.id };
};

/**
 * Focuses existing IRCTC tab or opens new tabs/windows.
 * Fully parallel launch with Promise.all over chrome.windows.create()
 */
const focusOrOpenIrctc = async (forcedAccounts = null) => {
  const settings = await getSettings();
  const accountsToUse = Array.isArray(forcedAccounts) && forcedAccounts.length > 0
    ? forcedAccounts
    : (settings?.multiAccounts || []);

  const isMultiTab = forcedAccounts ? true : !!settings?.multiTabEnabled;

  if (isMultiTab && Array.isArray(accountsToUse) && accountsToUse.length > 0) {
    const activeAccounts = accountsToUse.filter((acc) => acc.enabled !== false);
    if (activeAccounts.length > 0) {
      console.log(`[SW] Launching ${activeAccounts.length} parallel virtual browser windows!`);

      const workArea = await getPrimaryDisplayWorkArea();
      const layouts = computeWindowLayouts(activeAccounts.length, workArea);
      const safeCascadeLayout = {
        width: Math.min(Math.max(workArea.width - 60, 480), 900),
        height: Math.min(Math.max(workArea.height - 60, 360), 700),
        left: (workArea.left || 0) + 20,
        top: (workArea.top || 0) + 20,
      };

      // Launch all windows simultaneously with Promise.all
      const results = await Promise.all(
        activeAccounts.map((acc, idx) =>
          createAccountWindow(acc, layouts[idx], safeCascadeLayout)
        )
      );

      const openedCount = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);

      console.log(`[SW] Windows launch complete: ${openedCount} opened, ${failed.length} failed.`);

      if (failed.length > 0) {
        const failedNames = failed.map((f) => f.account.name || f.account.username).join(', ');
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon-128.png',
          title: 'Virtual Windows Launch Warning',
          message: `${openedCount} opened. Failed to open ${failed.length} windows: ${failedNames}`,
          priority: 2,
        });
      }

      return;
    }
  }

  // Single tab / single window fallback
  const existingTabs = await chrome.tabs.query({ url: ['*://www.irctc.co.in/*', '*://*.irctc.co.in/*'] });
  const targetTab = existingTabs.find((tab) => tab.url?.includes('/nget/train-search')) || existingTabs[0];

  if (targetTab?.id) {
    await chrome.tabs.update(targetTab.id, { url: IRCTC_URL, active: true });
    if (targetTab.windowId) {
      await chrome.windows.update(targetTab.windowId, { focused: true });
    }
    return;
  }

  const createdTab = await chrome.tabs.create({ url: IRCTC_URL, active: true });
  if (createdTab?.windowId) {
    await chrome.windows.update(createdTab.windowId, { focused: true });
  }
};

const syncBookingAlarm = async () => {
  await chrome.alarms.clear(BOOKING_ALARM);

  const settings = await getSettings();
  if (!settings?.automationStatus) {
    return;
  }

  const loginDateTime = getLoginDateTime(settings);
  if (!loginDateTime || loginDateTime.getTime() <= Date.now()) {
    return;
  }

  chrome.alarms.create(BOOKING_ALARM, { when: loginDateTime.getTime() });
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason == chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.runtime.openOptionsPage();
  }

  syncBookingAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  syncBookingAlarm();
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) {
    syncBookingAlarm();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== BOOKING_ALARM) {
    return;
  }

  const settings = await getSettings();
  if (!settings?.automationStatus) {
    return;
  }

  await chrome.notifications.create(BOOKING_NOTIFICATION, {
    type: 'basic',
    iconUrl: 'assets/icon-128.png',
    title: 'IRCTC automation started',
    message: `Opening IRCTC for ${getJourneySummary(settings)}. Keep the captcha step ready.`,
    priority: 2,
  });

  await focusOrOpenIrctc();
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === BOOKING_NOTIFICATION) {
    chrome.runtime.openOptionsPage();
  }
});

// Clean up per-window account mapping on tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`tab_account_${tabId}`);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'TRIGGER_MULTI_TAB_HIT') {
    focusOrOpenIrctc(message.multiAccounts);
    sendResponse({ status: 'success', message: 'Multi-tab virtual windows hit initiated!' });
    return true;
  }
  if (message?.action === 'GET_TAB_ACCOUNT') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.storage.local.get(`tab_account_${tabId}`, (res) => {
        sendResponse(res?.[`tab_account_${tabId}`] || null);
      });
      return true; // Keep message channel open for async response
    }
  }
  return false;
});
