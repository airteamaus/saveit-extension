// project-manager.js - Public ProjectManager wrapper

import { createProjectManagerController } from './project-manager-controller.js';

class ProjectManager {
  constructor(api, htmlUtils) {
    Object.assign(this, createProjectManagerController({ api, htmlUtils }));
  }
}

window.ProjectManager = ProjectManager;

/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProjectManager, createProjectManagerController };
}
/* eslint-enable no-undef */
