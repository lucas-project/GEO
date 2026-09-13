const NON_HTML_PATH = /\.(?:7z|apk|bin|bz2|csv|docx?|exe|gif|gz|ico|iso|jpe?g|m4a|mp3|mp4|msi|msix|pdf|pkg|png|pptx?|rar|svg|tar|tgz|wav|webp|woff2?|xlsx?|xz|zip)(?:$|[?#])/i;

export function isAuditablePageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? !NON_HTML_PATH.test(url.pathname) : false;
  } catch {
    return false;
  }
}
