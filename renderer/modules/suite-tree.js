
import { state } from './state.js';
import {
    suitePickerModal,
    modalTitle,
    modalBackContainer,
    modalBackBtn,
    modalTreeContainer,
    createSuiteBtn,
    openSuitePickerBtn,
    currentContextDisplay
} from './elements.js';
import { log, validateInputs, escapeHtml } from './ui-helpers.js';
import { parseSteps, renderTestCaseTable } from './table.js';

// ===============================
// PLAN LISTING
// ===============================
export async function openModalForPlans() {
    suitePickerModal.style.display = "flex";
    modalTitle.textContent = "Select Test Plan";
    modalBackContainer.style.display = "none";
    modalTreeContainer.innerHTML = `<div style="padding:12px; text-align:center;">Loading Plans...</div>`;

    const inputs = validateInputs();

    try {
        // Fetch or use cached plans
        if (state.cachedPlans.length === 0) {
            state.cachedPlans = await window.api.fetchTestPlans({ ...inputs, project: state.selectedProject });
        }
        renderPlanListInModal(state.cachedPlans);
    } catch (err) {
        modalTreeContainer.innerHTML = `<div style="color:var(--danger); padding:12px;">Failed to load plans: ${err.message}</div>`;
    }
}

function renderPlanListInModal(plans) {
    if (plans.length === 0) {
        modalTreeContainer.innerHTML = `<div style="padding:12px; text-align:center;">No Test Plans found.</div>`;
        return;
    }

    modalTreeContainer.innerHTML = "";

    plans.forEach(plan => {
        const item = document.createElement("div");
        item.className = "suite-tree-item";
        item.style.padding = "10px 12px";
        item.style.borderBottom = "1px solid var(--border)";

        item.innerHTML = `
            <span class="icon">📋</span>
            <span class="suite-label" style="font-weight:600;">${escapeHtml(plan.name)}</span>
            <span style="margin-left:auto; color:var(--text-muted); font-size:11px;">#${plan.id}</span>
        `;

        item.onclick = () => {
            openModalForSuites(plan); // Call the recursive/improved version
        };

        modalTreeContainer.appendChild(item);
    });
}

// ===============================
// SUITE HIERARCHY
// ===============================
export async function openModalForSuites(plan) {
    state.selectedPlanId = plan.id;

    modalTitle.textContent = `Suites in "${plan.name}"`;
    modalBackContainer.style.display = "block";

    // Back Button Logic
    modalBackBtn.onclick = () => {
        openModalForPlans();
    };

    // Enable "Create Suite"
    createSuiteBtn.style.display = "block";

    const cacheKey = `${state.selectedProject}-${plan.id}`;

    // Check cache first
    if (state.suiteHierarchyCache.has(cacheKey)) {
        console.log(`[Cache] Using cached hierarchy for plan ${plan.id}`);
        const rootSuite = state.suiteHierarchyCache.get(cacheKey);
        modalTreeContainer.innerHTML = "";

        // Render children of root suite
        if (rootSuite.children && rootSuite.children.length > 0) {
            renderModalSuiteTree(rootSuite.children, modalTreeContainer, 0, plan);
        } else {
            modalTreeContainer.innerHTML = `<div style="padding:12px;">No suites found.</div>`;
        }
        return;
    }

    // Not in cache - fetch recursively with progress
    modalTreeContainer.innerHTML = `<div style="padding:24px; text-align:center;">
        <div class="spinner" style="margin:0 auto 16px;"></div>
        <div style="font-weight:500; margin-bottom:8px;">Loading hierarchy...</div>
        <div id="hierarchyProgress" style="color:var(--text-muted); font-size:12px;">Starting...</div>
    </div>`;

    const progressDiv = document.getElementById("hierarchyProgress");

    // Setup progress listener
    if (window.api.onSuiteHierarchyProgress) {
        window.api.onSuiteHierarchyProgress((progress) => {
            if (progressDiv) {
                progressDiv.textContent = `Fetched ${progress.current} suite(s)... (${progress.name})`;
            }
        });
    }

    const inputs = validateInputs();
    try {
        const rootSuite = await window.api.fetchSuiteHierarchy({
            ...inputs,
            project: state.selectedProject,
            planId: plan.id
        });

        console.log(`[Hierarchy] Fetched complete tree for plan ${plan.id}`);

        // Cache the result
        state.suiteHierarchyCache.set(cacheKey, rootSuite);

        modalTreeContainer.innerHTML = "";

        // Render children of root suite
        if (rootSuite.children && rootSuite.children.length > 0) {
            renderModalSuiteTree(rootSuite.children, modalTreeContainer, 0, plan);
        } else {
            modalTreeContainer.innerHTML = `<div style="padding:12px;">No suites found.</div>`;
        }

    } catch (err) {
        modalTreeContainer.innerHTML = `<div style="color:var(--danger); padding:12px;">Failed to load suites: ${err.message}</div>`;
    }
}

function renderModalSuiteTree(suites, container, depth, plan) {
    suites.forEach(suite => {
        const row = document.createElement("div");
        row.className = "suite-tree-item";
        row.style.paddingLeft = `${12 + (depth * 20)}px`;

        const hasChildren = suite.children && suite.children.length > 0;

        const caret = document.createElement("span");
        caret.className = "caret-icon";
        caret.textContent = hasChildren ? "▸" : "";
        caret.style.display = "inline-block";
        caret.style.width = "20px";
        caret.style.textAlign = "center";
        caret.style.transition = "transform 0.2s ease";

        const icon = document.createElement("span");
        icon.className = "icon";
        icon.textContent = "📁";
        icon.style.marginRight = "6px";

        const label = document.createElement("span");
        label.className = "suite-label";
        label.textContent = suite.name;

        row.appendChild(caret);
        row.appendChild(icon);
        row.appendChild(label);

        const childrenContainer = document.createElement("div");
        childrenContainer.className = "suite-children";
        childrenContainer.style.display = "none";
        childrenContainer.style.marginLeft = "8px";

        container.appendChild(row);
        container.appendChild(childrenContainer);

        // Click Row -> Select Suite & Close
        row.onclick = (e) => {
            e.stopPropagation();
            selectSuite(plan, suite);
        };

        // Click Caret -> Expand
        caret.onclick = (e) => {
            e.stopPropagation();
            if (hasChildren) {
                const isClosed = childrenContainer.style.display === "none";
                childrenContainer.style.display = isClosed ? "block" : "none";
                caret.style.transform = isClosed ? "rotate(90deg)" : "rotate(0deg)";
                icon.textContent = isClosed ? "📂" : "📁";

                if (childrenContainer.innerHTML === "") {
                    renderModalSuiteTree(suite.children, childrenContainer, depth + 1, plan);
                }
            }
        }
    });
}

// ===============================
// SELECTION & CREATION
// ===============================
async function selectSuite(plan, suite) {
    state.selectedSuiteId = suite.id;

    currentContextDisplay.innerHTML = `
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">${escapeHtml(plan.name)}</div>
        <div style="font-size:12px;">📁 ${escapeHtml(suite.name)}</div>
    `;
    currentContextDisplay.style.color = "var(--text-primary)";

    suitePickerModal.style.display = "none";
    openSuitePickerBtn.textContent = "Change Plan / Suite";

    await fetchTestCasesFromSuite();
}

export async function fetchTestCasesFromSuite() {
    try {
        const inputs = validateInputs();
        if (!inputs || !state.selectedSuiteId) return;

        log("Loading test cases from suite...");
        const existingTestCases = await window.api.fetchTestCasesFromSuite({
            ...inputs,
            project: state.selectedProject,
            planId: state.selectedPlanId,
            suiteId: state.selectedSuiteId
        });

        // Strip HTML
        const stripHtml = (html) => {
            if (!html) return "";
            const tmp = document.createElement("DIV");
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || "";
        };

        state.testCases = existingTestCases.map(tc => ({
            id: tc.id,
            title: tc.title || "",
            preconditions: stripHtml(tc.preconditions) || "",
            steps: parseSteps(tc.steps || ""),
            expected: stripHtml(tc.expected) || "",
            testType: tc.testType || "Positive",
            state: tc.state || "",
            assignedTo: tc.assignedTo || "",
            automationStatus: tc.automationStatus || "",
            isExisting: true
        }));

        // This was in original to track editing mode
        // state.isEditingExisting = true; // Implied by isExisting property on items

        renderTestCaseTable();
        log(`Loaded ${state.testCases.length} test cases`, "success");
    } catch (err) {
        log(`Failed to load test cases: ${err.message}`, "error");
        state.testCases = [];
        renderTestCaseTable();
    }
}

export async function createSuite() {
    const inputs = validateInputs();
    if (!inputs || !state.selectedProject || !state.selectedPlanId) {
        alert("Please select a Project and Test Plan first.");
        return;
    }

    const suiteName = prompt("Enter new Suite Name:");
    if (!suiteName) return;

    try {
        log(`Creating suite "${suiteName}"...`);
        /* 
           Note: The backend createSuite handles creating a "RequirementSuite" or "StaticSuite"
           defaulting to Static if not specified.
        */
        await window.api.createSuite({
            ...inputs,
            project: state.selectedProject,
            planId: state.selectedPlanId,
            suiteName
        });

        log(`Suite "${suiteName}" created!`, "success");

        // Clear cache so it re-fetches
        const cacheKey = `${state.selectedProject}-${state.selectedPlanId}`;
        state.suiteHierarchyCache.delete(cacheKey);

        // Refresh view if possible
        const plan = state.cachedPlans.find(p => p.id === state.selectedPlanId);
        if (plan) openModalForSuites(plan);

    } catch (err) {
        log(`Failed to create suite: ${err.message}`, "error");
    }
}
