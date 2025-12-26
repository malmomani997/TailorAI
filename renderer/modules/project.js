
import { state } from './state.js';
import {
    projectSelect,
    openSuitePickerBtn,
    currentContextDisplay,
    createSuiteBtn,
    loadProjectsBtn
} from './elements.js';
import { log, validateInputs, escapeHtml } from './ui-helpers.js';

export async function fetchProjects() {
    try {
        const inputs = validateInputs();
        if (!inputs) return;

        log("Fetching projects...");
        const projects = await window.api.fetchProjects(inputs);

        projectSelect.innerHTML = `<option disabled selected>Select Project</option>`;
        openSuitePickerBtn.disabled = true;
        currentContextDisplay.textContent = "No Plan or Suite selected.";

        projects.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.name;
            opt.textContent = p.name;
            projectSelect.appendChild(opt);
        });

        log(`Loaded ${projects.length} projects`, "success");
    } catch (err) {
        log(`Failed to load projects: ${err.message}`, "error");
    }
}

export async function fetchProjectUsers() {
    try {
        const inputs = validateInputs();
        if (!inputs || !state.selectedProject) return;

        log("Fetching project users...");
        state.projectUsers = await window.api.fetchProjectUsers({
            ...inputs,
            project: state.selectedProject
        });
        log(`Loaded ${state.projectUsers.length} users`, "success");

        // Populate Datalist if needed (though we use custom dropdown now)
        // const datalist = document.getElementById("projectUsersList"); 
        // if (datalist) datalist.innerHTML = state.projectUsers.map(u => `<option value="${u.displayName}">`).join("");

    } catch (err) {
        log(`Failed to load users: ${err.message}`, "error");
        state.projectUsers = [];
    }
}
