/**
 * Background service worker.
 *
 * Opens the side panel whenever the toolbar icon is clicked.
 */

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('sidePanel.setPanelBehavior failed', err));

// Persist the default API URL on install.
chrome.runtime.onInstalled.addListener(async () => {
  const { geoApiUrl } = await chrome.storage.local.get('geoApiUrl');
  if (!geoApiUrl) {
    await chrome.storage.local.set({ geoApiUrl: 'http://localhost:3000' });
  }
});
