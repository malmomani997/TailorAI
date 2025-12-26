
import { state } from './state.js';
import {
    loadProjectsBtn,
    projectSelect,
    openSuitePickerBtn,
    closeSuitePickerBtn,
    createSuiteBtn,
    importExcelBtn,
    exportExcelBtn,
    submitTestCasesBtn,
    addNewTestCaseBtn,
    suitePickerModal,
    currentContextDisplay
} from './elements.js';
import { fetchProjects, fetchProjectUsers } from './project.js';
import { openModalForPlans, createSuite, fetchTestCasesFromSuite } from './suite-tree.js';
import { log, validateInputs } from './ui-helpers.js';
import { renderTestCaseTable, serializeSteps } from './table.js';
import { initGlobalDropdown } from './user-search.js';

// ===============================
// INITIALIZATION
// ===============================
if (document.body) {
    initGlobalDropdown();
} else {
    document.addEventListener("DOMContentLoaded", initGlobalDropdown);
}

// ===============================
// PROJECT & USER EVENTS
// ===============================
loadProjectsBtn.onclick = fetchProjects;

projectSelect.onchange = async () => {
    state.selectedProject = projectSelect.value;
    state.selectedPlanId = null;
    state.selectedSuiteId = null;
    state.cachedPlans = [];

    // Reset Context Display
    currentContextDisplay.innerHTML = `<span style="color:var(--text-muted)">No Plan or Suite selected.</span>`;
    openSuitePickerBtn.disabled = true;
    openSuitePickerBtn.textContent = "Select Plan & Suite";
    createSuiteBtn.style.display = "none";

    // Fetch Project Users (Background)
    await fetchProjectUsers();

    // Enable "Select" button
    openSuitePickerBtn.disabled = false;
};

// ===============================
// SUITE / MODAL EVENTS
// ===============================
openSuitePickerBtn.onclick = () => {
    if (!state.selectedProject) return;
    openModalForPlans();
};

closeSuitePickerBtn.onclick = () => {
    suitePickerModal.style.display = "none";
};

createSuiteBtn.onclick = createSuite;

// ===============================
// EXCEL EVENTS
// ===============================
importExcelBtn.onclick = async () => {
    try {
        const filePath = await window.api.openExcelDialog();
        if (!filePath) return;

        log(`Loading Excel: ${filePath}`);
        const loadedCases = await window.api.loadExcel(filePath);

        const mapped = loadedCases.map(tc => ({
            ...tc,
            isExisting: false
        }));

        state.testCases = state.isEditingExisting ? [...state.testCases, ...mapped] : mapped;
        renderTestCaseTable();

        log(`Loaded ${mapped.length} test cases from Excel`, "success");
    } catch (err) {
        log(`Failed to import Excel: ${err.message}`, "error");
    }
};

exportExcelBtn.onclick = async () => {
    if (!state.testCases.length) {
        alert("No test cases to export.");
        return;
    }

    try {
        const filePath = await window.api.saveExcelDialog();
        if (!filePath) return;

        log(`Exporting to Excel: ${filePath}`);

        await window.api.exportExcel({
            filePath,
            testCases: state.testCases
        });

        log("Export successful!", "success");
    } catch (err) {
        log(`Failed to export Excel: ${err.message}`, "error");
    }
};

// ===============================
// TEST CASE ACTIONS (ADD / SUBMIT)
// ===============================
addNewTestCaseBtn.onclick = () => {
    state.testCases.push({
        title: "",
        preconditions: "",
        steps: [{ action: "", expected: "" }],
        expected: "",
        assignedTo: "",
        isExisting: false
    });
    renderTestCaseTable();
};

submitTestCasesBtn.onclick = async () => {
    try {
        const inputs = validateInputs();
        if (!inputs || !state.selectedSuiteId) return;

        const newCases = state.testCases.filter(tc => !tc.isExisting);
        if (!newCases.length) {
            alert("No new test cases to submit.");
            return;
        }

        submitTestCasesBtn.disabled = true;
        log(`Creating ${newCases.length} test cases...`);

        const payloadCases = newCases.map(tc => ({
            ...tc,
            steps: serializeSteps(tc.steps),
            assignedTo: tc.assignedTo // Use Display Name directly
        }));

        const created = await window.api.createTestCases({
            ...inputs,
            project: state.selectedProject,
            testCases: payloadCases,
            userStoryId: null
        });

        const successfulIds = created
            .filter(c => c.success && c.id)
            .map(c => c.id);

        if (successfulIds.length > 0) {
            await window.api.addTestCaseToSuite({
                ...inputs,
                project: state.selectedProject,
                planId: state.selectedPlanId,
                suiteId: state.selectedSuiteId,
                testCaseIds: successfulIds
            });
            log(`Added ${successfulIds.length} test cases to suite`, "success");
        }

        if (created.length > successfulIds.length) {
            const failedCount = created.length - successfulIds.length;
            log(`Warning: ${failedCount} test cases failed to be created/linked.`, "warning");

            created.filter(c => !c.success).forEach(c => {
                log(`Error creating "${c.title}": ${c.error}`, "error");
            });
        }
        await fetchTestCasesFromSuite();
    } catch (err) {
        log(`Failed to submit test cases: ${err.message}`, "error");
    } finally {
        submitTestCasesBtn.disabled = false;
    }
};
