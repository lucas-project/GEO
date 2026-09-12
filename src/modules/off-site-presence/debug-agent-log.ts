/** Session debug logging for presence probe (remove after verification). */
export function debugPresenceLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  // #region agent log
  fetch('http://127.0.0.1:7325/ingest/c387cd27-4cf0-4de4-9c91-94fb3cf9648b', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a09fef' },
    body: JSON.stringify({
      sessionId: 'a09fef',
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
