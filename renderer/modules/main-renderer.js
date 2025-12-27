
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
    currentContextDisplay,
    saveDraftBtn,
    navReviews
} from './elements.js';
import { fetchProjects, fetchProjectUsers } from './project.js';
import { openModalForPlans, createSuite, fetchTestCasesFromSuite } from './suite-tree.js';
import { log, validateInputs } from './ui-helpers.js';
import { renderTestCaseTable, serializeSteps } from './table.js';
import { initGlobalDropdown } from './user-search.js';
import { apiClient } from './apiClient.js';
import { initReviewDashboard } from './review-manager.js';

import { initRouter } from './router.js';

// ===============================
// INITIALIZATION
// ===============================
const checkAuth = () => {
    const userJson = localStorage.getItem('user');
    if (!userJson) {
        window.location.href = 'login.html';
        return;
    }
    const user = JSON.parse(userJson);

    // Auto-fill inputs if available
    const orgInput = document.getElementById('org');
    const patInput = document.getElementById('pat');

    if (orgInput && user.orgUrl) orgInput.value = user.orgUrl;
    if (patInput && user.pat) patInput.value = user.pat;

    // Show/Hide Role specific elements
    if (user.role === 'Lead') {
        if (navReviews) navReviews.style.display = 'flex';
        // Leads can submit directly too, so keep submit btn
    } else {
        // Tester specific UI
        if (saveDraftBtn) saveDraftBtn.style.display = 'block';
        if (submitTestCasesBtn) submitTestCasesBtn.style.display = 'none'; // Force Draft flow
    }
};

const init = () => {
    checkAuth();
    initGlobalDropdown();
    initRouter();
    initReviewDashboard();
};

if (document.body) {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}

// Logout Handler
window.logout = () => {
    localStorage.removeItem('user');
    window.location.href = 'login.html';
};

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
// TEST CASE ACTIONS (ADD / SUBMIT / DRAFT)
// ===============================
saveDraftBtn.onclick = async () => {
    const user = JSON.parse(localStorage.getItem('user'));

    // Validate inputs locally (ensure title exists)
    const newCases = state.testCases.filter(tc => !tc.isExisting);
    if (!newCases.length) {
        alert("No new test cases to save as draft.");
        return;
    }

    try {
        saveDraftBtn.disabled = true;
        log(`Saving ${newCases.length} drafts to Pending Reviews...`);

        let successCount = 0;
        for (const tc of newCases) {
            if (!tc.title) continue;

            await apiClient.createDraft({
                title: tc.title,
                steps: tc.steps, // Array of {action, expected}
                expectedResult: tc.expected,
                authorId: user.id,
                suiteId: state.selectedSuiteId // Optional context
            });
            successCount++;
        }

        log(`Saved ${successCount} drafts successfully!`, "success");

        // Clear new cases from table
        state.testCases = state.testCases.filter(tc => tc.isExisting);
        renderTestCaseTable();

    } catch (err) {
        log(`Failed to save drafts: ${err.message}`, "error");
    } finally {
        saveDraftBtn.disabled = false;
    }
};

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
