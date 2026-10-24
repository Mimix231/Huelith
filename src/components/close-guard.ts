/** Pure close-request gate. Native Tauri listeners must prevent closure synchronously. */
export interface CloseRequestEvent {
  preventDefault(): void;
}

export function requiresCloseConfirmation(dirtyDocuments: number, editingText: boolean): boolean {
  return dirtyDocuments > 0 || editingText;
}

/**
 * Tauri's close event must be cancelled before opening any asynchronous UI.
 * A clean window is intentionally allowed to close via Tauri's normal pathway.
 */
export function guardCloseRequest(
  event: CloseRequestEvent,
  dirtyDocuments: number,
  editingText: boolean,
  showConfirmation: () => void,
): void {
  if (!requiresCloseConfirmation(dirtyDocuments, editingText)) return;
  event.preventDefault();
  showConfirmation();
}
