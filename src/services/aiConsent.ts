// Module-level (not component state) so the "your text is sent to Gemini"
// disclosure shows once per app load across every AI-assist entry point
// (writing assist, nutrition estimate), not once per component mount.
let shown = false;

export function isAiConsentShown(): boolean {
  return shown;
}

export function markAiConsentShown(): void {
  shown = true;
}
