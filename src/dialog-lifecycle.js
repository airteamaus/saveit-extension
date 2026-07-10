// Shared open/close lifecycle for the modal dialogs on the new-tab page
// (import-panel, sharing-centre). Both previously duplicated the same DOM
// chrome: toggle .hidden on backdrop+dialog, flip aria-hidden, clear the
// dialog children, bind backdrop-click to close, and (for sharing-centre)
// close on Escape. Centralizing it keeps the chrome in sync and gives every
// dialog Escape-to-close for free.

export function createDialogLifecycle({
  getBackdrop,
  getDialog,
  documentObj = document,
  onClose = () => {}
} = {}) {
  function close() {
    const backdrop = getBackdrop();
    const dialog = getDialog();
    backdrop?.classList.add('hidden');
    backdrop?.setAttribute('aria-hidden', 'true');
    dialog?.classList.add('hidden');
    dialog?.replaceChildren();
    onClose();
  }

  function show() {
    const backdrop = getBackdrop();
    const dialog = getDialog();
    backdrop?.classList.remove('hidden');
    backdrop?.setAttribute('aria-hidden', 'false');
    dialog?.classList.remove('hidden');
    if (backdrop) backdrop.onclick = close;
  }

  // Escape closes the dialog. No-ops when it isn't visible so the listener can
  // stay bound for the document lifetime without interfering with other surfaces.
  function escapeKeyListener(event) {
    if (event.key === 'Escape' && !getDialog()?.classList.contains('hidden')) {
      close();
    }
  }

  // Guarded so test fixtures with a stub document don't blow up at bind time.
  if (typeof documentObj?.addEventListener === 'function') {
    documentObj.addEventListener('keydown', escapeKeyListener);
  }

  return { show, close, escapeKeyListener };
}
