
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
    // In elements.js or initialization
    // Just update the HTML text directly via ID since it's hardcoded in HTML
    // But wait, the button text is in HTML. Let's update it there. 
    // Skipping JS change for text, doing it in HTML next step.
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
// ===============================
// TEST CASE ACTIONS (ADD / SUBMIT / DRAFT)
// ===============================
let pendingDrafts = []; // Store drafts while selecting reviewer

const reviewerModal = document.getElementById('reviewerModal');
const closeReviewerModal = document.getElementById('closeReviewerModal');
const reviewerSelect = document.getElementById('reviewerSelect');
const confirmSaveDraftBtn = document.getElementById('confirmSaveDraft');

closeReviewerModal.onclick = () => {
    reviewerModal.style.display = 'none';
};

saveDraftBtn.onclick = async () => {
    const user = JSON.parse(localStorage.getItem('user'));

    // Validate inputs locally
    // We want to allow saving ANY case the user wants to propose changes for.
    // So we use state.testCases (or careful selection).
    // For now, let's assume we want to save ALL currently visible cases as a batch, 
    // OR we could filter for Modified ones if we tracked dirty state.
    // To keep it simple: Save ALL visible cases in the table to the Review Queue.
    const casesToSave = state.testCases;

    if (!casesToSave.length) {
        alert("No test cases to save as draft.");
        return;
    }

    pendingDrafts = casesToSave; // Store for later

    // Open Modal
    reviewerModal.style.display = 'flex';
    reviewerSelect.innerHTML = '<option value="" disabled selected>Loading Leads...</option>';

    try {
        // Fetch Leads from the same Organization
        const leads = await apiClient.getUsers('Lead', user.orgUrl);
        reviewerSelect.innerHTML = '<option value="" disabled selected>Select a Reviewer...</option>';

        if (leads.length === 0) {
            reviewerSelect.innerHTML += '<option value="" disabled>No Leads found in your Org</option>';
        }

        leads.forEach(lead => {
            // Don't assign to self if tester is also a lead (unlikely but good safety)
            const option = document.createElement('option');
            option.value = lead.id;
            option.textContent = lead.username;
            reviewerSelect.appendChild(option);
        });

    } catch (err) {
        log(`Failed to fetch reviewers: ${err.message}`, "error");
        reviewerSelect.innerHTML = '<option value="" disabled>Error loading reviewers</option>';
    }
};

confirmSaveDraftBtn.onclick = async () => {
    const reviewerId = reviewerSelect.value;
    if (!reviewerId) {
        alert("Please select a reviewer.");
        return;
    }

    const user = JSON.parse(localStorage.getItem('user'));

    try {
        confirmSaveDraftBtn.disabled = true;
        reviewerModal.style.display = 'none';

        log(`Submitting PR with ${pendingDrafts.length} changes (Reviewer: ${reviewerId})...`);

        let successCount = 0;
        for (const tc of pendingDrafts) {
            if (!tc.title) continue;

            await apiClient.createDraft({
                title: tc.title,
                steps: tc.steps,
                expectedResult: tc.expected,
                authorId: user.id,
                suiteId: state.selectedSuiteId,
                reviewerId: reviewerId,
                azureId: tc.isExisting ? tc.id : null,
                preconditions: tc.preconditions,
                testType: tc.testType,
                suiteTitle: state.selectedSuiteName || 'Unknown Suite'
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
        confirmSaveDraftBtn.disabled = false;
        pendingDrafts = [];
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
