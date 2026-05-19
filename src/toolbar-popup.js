const browserApi = globalThis.browser?.runtime ? globalThis.browser : globalThis.chrome;

const saveDefaultBtn = document.getElementById('save-default-btn');
const projectList = document.getElementById('toolbar-project-list');
const statusEl = document.getElementById('toolbar-popup-status');

function setStatus(message = '', state = 'info') {
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function setBusy(isBusy, message = '') {
  document.querySelectorAll('button').forEach((button) => {
    button.disabled = isBusy;
  });
  setStatus(message, isBusy ? 'info' : statusEl?.dataset?.state || 'info');
}

async function sendRuntimeMessage(message) {
  if (!browserApi?.runtime?.sendMessage) {
    throw new Error('Browser runtime API not available');
  }

  if (globalThis.browser?.runtime?.sendMessage) {
    return await globalThis.browser.runtime.sendMessage(message);
  }

  return await new Promise((resolve, reject) => {
    globalThis.chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = globalThis.chrome.runtime?.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(response);
    });
  });
}

function renderProjects(projects) {
  if (!projectList) {
    return;
  }

  projectList.setAttribute('aria-busy', 'false');
  projectList.replaceChildren();

  if (!Array.isArray(projects) || projects.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'toolbar-popup-empty';
    emptyMessage.textContent = 'No projects yet. Use Save to keep this page.';
    projectList.append(emptyMessage);
    return;
  }

  projects.forEach((project) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-popup-project-btn';
    button.textContent = project.name;
    button.addEventListener('click', () => {
      void handleSave(project.id, `Saving to ${project.name}...`);
    });
    projectList.append(button);
  });
}

async function loadProjects() {
  projectList?.setAttribute('aria-busy', 'true');
  setStatus('');

  const response = await sendRuntimeMessage({ action: 'getToolbarProjects' });
  if (!response?.success) {
    renderProjects([]);
    setStatus(response?.error || 'Failed to load projects.', 'error');
    return;
  }

  renderProjects(response.projects || []);
  setStatus('');
}

async function handleSave(projectId = null, loadingMessage = 'Saving...') {
  setBusy(true, loadingMessage);

  const response = await sendRuntimeMessage({
    action: 'saveCurrentPage',
    ...(projectId ? { projectId } : {})
  });

  if (response?.success) {
    window.close();
    return;
  }

  setBusy(false);
  setStatus(response?.error || 'Failed to save page.', 'error');
}

saveDefaultBtn?.addEventListener('click', () => {
  void handleSave();
});

void loadProjects().catch((error) => {
  renderProjects([]);
  setStatus(error.message || 'Failed to load projects.', 'error');
});
