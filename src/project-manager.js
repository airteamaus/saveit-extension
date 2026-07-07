// project-manager.js - Public ProjectManager wrapper

import { createProjectManagerController } from './project-manager-controller.js';

class ProjectManager {
  constructor(api, htmlUtils, { notify } = {}) {
    Object.assign(this, createProjectManagerController({ api, htmlUtils, notify }));
  }
}

window.ProjectManager = ProjectManager;

export { ProjectManager, createProjectManagerController };
export default { ProjectManager, createProjectManagerController };
