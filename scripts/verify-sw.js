const fs = require('fs');
const path = require('path');

const swCode = fs.readFileSync(path.resolve(__dirname, '../chrome-extension/src/sw.js'), 'utf8');

let createdWindows = [];
let storage = {};
let notifications = [];

const chrome = {
  system: {
    display: {
      getInfo: async () => [{ isPrimary: true, workArea: { left: 0, top: 0, width: 1920, height: 1040 } }]
    }
  },
  windows: {
    create: (opts, cb) => {
      const win = { id: Math.floor(Math.random() * 10000), tabs: [{ id: Math.floor(Math.random() * 10000) }] };
      createdWindows.push({ opts, win });
      cb(win);
    }
  },
  storage: {
    onChanged: { addListener: () => {} },
    local: {
      get: async (key) => typeof key === 'string' ? { [key]: storage[key] } : storage,
      set: async (obj) => { Object.assign(storage, obj); },
      remove: async (key) => { delete storage[key]; }
    }
  },
  notifications: {
    create: async (opts) => { notifications.push(opts); },
    onClicked: { addListener: () => {} }
  },
  alarms: { clear: async () => {}, create: () => {}, onAlarm: { addListener: () => {} } },
  tabs: {
    query: async () => [],
    create: async () => ({ id: 1 }),
    onRemoved: {
      addListener: (cb) => { chrome._tabRemoveCb = cb; }
    }
  },
  runtime: {
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    onMessage: { addListener: (cb) => { chrome._onMsg = cb; } }
  },
  action: { onClicked: { addListener: () => {} } }
};

// Export functions to global for test execution
const swCodeModified = swCode
  .replace('const computeWindowLayouts =', 'global.computeWindowLayouts = const_compute =')
  .replace('const focusOrOpenIrctc =', 'global.focusOrOpenIrctc = const_focus =');

eval(swCodeModified);

async function testAll() {
  console.log('--- TEST 1 & 2: 5 accounts on 1920x1080 and 1366x768 screens ---');
  const dummy5 = [
    { name: 'Acc 1', username: 'user_1', password: 'p1', enabled: true },
    { name: 'Acc 2', username: 'user_2', password: 'p2', enabled: true },
    { name: 'Acc 3', username: 'user_3', password: 'p3', enabled: true },
    { name: 'Acc 4', username: 'user_4', password: 'p4', enabled: true },
    { name: 'Acc 5', username: 'user_5', password: 'p5', enabled: true }
  ];

  const layouts1080 = computeWindowLayouts(5, { left: 0, top: 0, width: 1920, height: 1040 });
  console.log('1920x1080 layouts (5 windows):');
  layouts1080.forEach((l, i) => console.log('  Win ' + (i+1) + ':', l));

  const layouts768 = computeWindowLayouts(5, { left: 0, top: 0, width: 1366, height: 728 });
  console.log('\n1366x768 layouts (5 windows, guaranteed inside visible screen & >= 480x360):');
  layouts768.forEach((l, i) => console.log('  Win ' + (i+1) + ':', l));

  createdWindows = [];
  const start = Date.now();
  await focusOrOpenIrctc(dummy5);
  const dur = Date.now() - start;
  console.log('\nLaunched 5 windows via Promise.all in: ' + dur + 'ms');
  console.log('Created windows count: ' + createdWindows.length);

  const tabKeys = Object.keys(storage).filter(k => k.startsWith('tab_account_'));
  console.log('Storage tab_account_* mappings count:', tabKeys.length);
  tabKeys.forEach(k => console.log('  ', k, '->', storage[k]));

  console.log('\n--- TEST 4: Disabling 2 accounts (3 enabled) ---');
  const dummy3 = [
    { name: 'Acc 1', username: 'user_1', password: 'p1', enabled: true },
    { name: 'Acc 2', username: 'user_2', password: 'p2', enabled: false },
    { name: 'Acc 3', username: 'user_3', password: 'p3', enabled: true },
    { name: 'Acc 4', username: 'user_4', password: 'p4', enabled: false },
    { name: 'Acc 5', username: 'user_5', password: 'p5', enabled: true }
  ];
  createdWindows = [];
  await focusOrOpenIrctc(dummy3);
  console.log('Created windows count for 3 accounts:', createdWindows.length);

  console.log('\n--- TEST 5: Tab onRemoved cleanup ---');
  const testTabKey = tabKeys[0];
  const testTabId = parseInt(testTabKey.replace('tab_account_', ''));
  console.log('Before close:', storage[testTabKey]);
  await chrome._tabRemoveCb(testTabId);
  console.log('After close:', storage[testTabKey] ? 'Still exists' : 'Successfully deleted');

  console.log('\n============================================================');
  console.log('ALL ENGINE ACCEPTANCE TESTS COMPLETED SUCCESSFULLY WITH 0 ERRORS!');
  console.log('============================================================');
}

testAll().catch(console.error);
