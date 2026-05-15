const input = document.getElementById('api-url');
const status = document.getElementById('status');

async function load() {
  const { geoApiUrl } = await chrome.storage.local.get('geoApiUrl');
  input.value = geoApiUrl || 'http://localhost:3000';
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ geoApiUrl: input.value.trim() });
  status.classList.remove('hidden');
  status.textContent = 'Saved.';
  setTimeout(() => status.classList.add('hidden'), 1500);
});

load();
