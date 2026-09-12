/**
 * Pre-download CloakBrowser stealth Chromium (~200MB, cached under ~/.cloakbrowser).
 * Run: npm run cloak:install
 */
async function main(): Promise<void> {
  const mod = await import('cloakbrowser');
  if (typeof mod.ensureBinary === 'function') {
    await mod.ensureBinary();
    console.log('CloakBrowser binary ready.');
    return;
  }
  const browser = await mod.launch({ headless: true });
  await browser.close();
  console.log('CloakBrowser launched successfully (binary cached).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
