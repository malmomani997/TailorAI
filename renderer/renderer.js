// ===============================
// Tailor AI – Renderer (IPC Mode)
// ===============================

// -------------------------------
// DOM Elements
// -------------------------------
const orgInput = document.getElementById("org");
const patInput = document.getElementById("pat");
const loadProjectsBtn = document.getElementById("loadProjects");

const projectSelect = document.getElementById("projects");
const openSuitePickerBtn = document.getElementById("openSuitePickerBtn");
const currentContextDisplay = document.getElementById("currentContextDisplay");
const createSuiteBtn = document.getElementById("createSuite");
// const testPlanSelect = document.getElementById("testPlans"); // Removed

// Modal Elements
// Modal Elements
const suitePickerModal = document.getElementById("suitePickerModal");
const closeSuitePickerBtn = document.getElementById("closeSuitePicker");
const modalTreeContainer = document.getElementById("modalTreeContainer");
// New Modal Elements
const modalTitle = document.getElementById("modalTitle");
const modalBackContainer = document.getElementById("modalBackContainer");
const modalBackBtn = document.getElementById("modalBackToPlans");

const consoleBox = document.getElementById("console");
const testCaseTable = document.getElementById("testCaseTable");

const importExcelBtn = document.getElementById("importExcel");
const submitTestCasesBtn = document.getElementById("submitTestCases");
const addNewTestCaseBtn = document.getElementById("addNewTestCase");
// const userStoryIdInput = document.getElementById("userStoryId"); // Removed
// const userStoryIdInput = document.getElementById("userStoryId"); // Removed

// -------------------------------
// State
// -------------------------------
let selectedProject = null;
let selectedPlanId = null;
let selectedSuiteId = null;
let projectUsers = [];
let cachedPlans = []; // Store plans for back navigation

// Suite Hierarchy Cache
const suiteHierarchyCache = new Map(); // key: `${project}-${planId}`
const backgroundFetches = new Map(); // track ongoing fetches

let testCases = [];
let existingTestCases = [];
let isEditingExisting = false;

// -------------------------------
// Logger
// -------------------------------
function log(message, type = "info") {
    const colors = {
        info: "#111827",
        success: "#065f46",
        warning: "#92400e",
        error: "#7f1d1d"
    };

    const line = document.createElement("div");
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    line.style.color = colors[type] || colors.info;

    consoleBox.appendChild(line);
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

// -------------------------------
// Helpers
// -------------------------------
function getPat() {
    return patInput.value.trim();
}

function validateInputs() {
    const orgUrl = orgInput.value.trim();
    const pat = getPat();

    if (!orgUrl) {
        alert("Please enter Azure DevOps organization URL");
        return null;
    }
    if (!pat) {
        alert("Please enter your Personal Access Token (PAT)");
        return null;
    }
    return { orgUrl, pat };
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// ===============================
// PROJECTS
// ===============================
// ===============================
// PROJECTS
// ===============================
loadProjectsBtn.onclick = async () => {
    try {
        const inputs = validateInputs();
        if (!inputs) return;

        log("Fetching projects...");
        const projects = await window.api.fetchProjects(inputs);

        projectSelect.innerHTML = `<option disabled selected>Select Project</option>`;
        // Reset other UI
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
};

async function fetchProjectUsers() {
    try {
        const inputs = validateInputs();
        if (!inputs || !selectedProject) return;

        log("Fetching project users...");
        projectUsers = await window.api.fetchProjectUsers({
            ...inputs,
            project: selectedProject
        });
        log(`Loaded ${projectUsers.length} users`, "success");

        // Populate Datalist
        const datalist = document.getElementById("projectUsersList");
        datalist.innerHTML = projectUsers.map(u => `<option value="${u.displayName}">`).join("");

    } catch (err) {
        log(`Failed to load users: ${err.message}`, "error");
        projectUsers = [];
    }
}





// ===============================
// SMART USER SEARCH (GLOBAL DROPDOWN)
// ===============================
let searchTimeout = null;
let activeRowIndex = null;
let globalDropdown = null;

// Initialize global dropdown
function initGlobalDropdown() {
    if (globalDropdown) return;
    globalDropdown = document.createElement("div");
    globalDropdown.className = "user-dropdown-list";
    globalDropdown.style.position = "fixed"; // Force fixed
    globalDropdown.style.maxHeight = "300px"; // Taller
    document.body.appendChild(globalDropdown);
    log("Global user dropdown initialized", "info");
}

// Call immediately if document body is ready (which it should be if script is at end)
if (document.body) {
    initGlobalDropdown();
} else {
    document.addEventListener("DOMContentLoaded", initGlobalDropdown);
}

window.handleUserSearch = async (query, index) => {
    if (!globalDropdown) return;

    activeRowIndex = index;
    const input = document.getElementById(`assign-input-${index}`);
    if (!input) return;

    // Position the dropdown
    const rect = input.getBoundingClientRect();
    globalDropdown.style.top = (rect.bottom + 2) + "px";
    globalDropdown.style.left = rect.left + "px";
    globalDropdown.style.width = rect.width + "px";

    // Show loading or local filter first
    if (!query) {
        renderUserList(projectUsers.slice(0, 10));
        return;
    }

    // 1. Filter local users
    const localMatches = projectUsers.filter(u =>
        u.displayName.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10); // Show more local matches

    renderUserList(localMatches, true /* isSearching */);

    if (query.length < 3) return;

    // 2. Debounced Remote Search
    if (searchTimeout) clearTimeout(searchTimeout);

    searchTimeout = setTimeout(async () => {
        try {
            log(`Searching directory for "${query}"...`);
            const inputs = validateInputs();
            const remoteMatches = await window.api.searchIdentities({
                ...inputs,
                project: selectedProject,
                query
            });

            const combined = [...localMatches];
            remoteMatches.forEach(rm => {
                if (!combined.find(c => c.displayName === rm.displayName)) {
                    combined.push(rm);
                }
            });

            renderUserList(combined, false);

        } catch (err) {
            console.error(err);
        }
    }, 400);
};

function renderUserList(users, isSearching = false) {
    if (!globalDropdown) return;

    if (users.length === 0 && !isSearching) {
        globalDropdown.innerHTML = `<div class="user-item" style="color:#9ca3af;font-style:italic;">No users found</div>`;
        globalDropdown.classList.add("active");
        return;
    }

    globalDropdown.innerHTML = users.map(u => `
        <div class="user-item" onmousedown="selectUser('${escapeHtml(u.displayName)}', '${escapeHtml(u.uniqueName || "")}')">
            <span class="name">${escapeHtml(u.displayName)}</span>
            ${u.uniqueName ? `<span class="email">${escapeHtml(u.uniqueName)}</span>` : ''}
        </div>
    `).join("");

    if (isSearching) {
        globalDropdown.innerHTML += `<div class="user-item" style="color:#6b7280;font-style:italic;font-size:11px;">Searching...</div>`;
    }

    globalDropdown.classList.add("active");
}

window.selectUser = (displayName, uniqueName) => {
    if (activeRowIndex === null) return;

    const i = activeRowIndex;

    // Update state
    testCases[i].assignedTo = displayName;
    testCases[i]._modified = true;

    // Cache user
    if (!projectUsers.find(u => u.displayName === displayName)) {
        projectUsers.push({ displayName, uniqueName });
    }

    // Update UI immediately (lightweight)
    const input = document.getElementById(`assign-input-${i}`);
    if (input) input.value = displayName;

    // Hide dropdown
    if (globalDropdown) globalDropdown.classList.remove("active");

    // Full render to ensure consistency (delay slightly to avoid jarring input replacement)
    // setTimeout(() => renderTestCaseTable(), 50); 
    // Actually, just full render is fine, but it kills focus. 
    // Since we just clicked, we don't hold focus. 
    renderTestCaseTable();
};

window.hideUserListDelayed = () => {
    // 200ms delay to allow click to register
    setTimeout(() => {
        if (globalDropdown) globalDropdown.classList.remove("active");
        activeRowIndex = null;
    }, 200);
};

// ===============================
// UNIFIED TREE (PLANS + SUITES)
// ===============================

// 1. Project Change
projectSelect.onchange = async () => {
    selectedProject = projectSelect.value;
    selectedPlanId = null;
    selectedSuiteId = null;
    cachedPlans = [];

    // Reset Context Display
    currentContextDisplay.innerHTML = `<span style="color:var(--text-muted)">No Plan or Suite selected.</span>`;
    openSuitePickerBtn.disabled = true;
    openSuitePickerBtn.textContent = "Select Plan & Suite";
    createSuiteBtn.style.display = "none";

    // Fetch Project Users (Background)
    fetchProjectUsers();

    // Enable "Select" button immediately (User clicks to load plans)
    openSuitePickerBtn.disabled = false;
};

// 2. Open Modal (Triggers Plan Load)
openSuitePickerBtn.onclick = () => {
    if (!selectedProject) return;
    openModalForPlans();
};

closeSuitePickerBtn.onclick = () => { suitePickerModal.style.display = "none"; };

// 3. View 1: List Plans
async function openModalForPlans() {
    suitePickerModal.style.display = "flex";
    modalTitle.textContent = "Select Test Plan";
    modalBackContainer.style.display = "none";
    modalTreeContainer.innerHTML = `<div style="padding:12px; text-align:center;">Loading Plans...</div>`;

    const inputs = validateInputs();

    try {
        // Fetch or use cached plans
        if (cachedPlans.length === 0) {
            cachedPlans = await window.api.fetchTestPlans({ ...inputs, project: selectedProject });
        }

        renderPlanListInModal(cachedPlans);

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
            openModalForSuites(plan);
        };

        modalTreeContainer.appendChild(item);
    });
}

// Unified Tree Renderer
// 4. View 2: List Suites (Drill Down)
async function openModalForSuites(plan) {
    return openModalForSuitesRecursive(plan);
}

/*
    selectedPlanId = plan.id;


    modalTitle.textContent = `Suites in "${plan.name}"`;
    modalBackContainer.style.display = "block"; // Show Back Button
    modalTreeContainer.innerHTML = `<div style="padding:12px; text-align:center;">Loading Suites...</div>`;

    // Back Button Logic
    modalBackBtn.onclick = () => {
        openModalForPlans(); // Go back to Level 1
    };

    // Enable "Create Suite" now that we have a plan
    createSuiteBtn.style.display = "block";

    const inputs = validateInputs();
    try {
        const suites = await window.api.fetchSuites({
            ...inputs,
            project: selectedProject,
            planId: plan.id
        });

        console.log("DEBUG: Fetched Suites:", suites);
        log(`DEBUG: Fetched ${suites ? suites.length : 0} suites for plan ${plan.id}`);

        // Recursively normalize 'suites' property to 'children' for asTreeView response
        function normalizeSuites(suite) {
            if (suite.suites && !suite.children) {
                suite.children = suite.suites;
            }
            if (suite.children && suite.children.length > 0) {
                suite.children.forEach(child => normalizeSuites(child));
            } else if (!suite.children) {
                suite.children = [];
            }
        }

        // Normalize all fetched suites recursively
        suites.forEach(s => normalizeSuites(s));

        // Hierarchy Logic
        let rootSuites = [];

        // Strategy: 'expand=true' gives us a flat list where some items (roots & others)
        // have their 'children' arrays populated with IDs or objects.
        // We MUST NOT clear these children. Instead, we must find the "True Roots"
        // by filtering out any suite that appears in another suite's children list.

        console.log("[Hierarchy] Building Tree via Child-Reference Filter...");

        const suiteMap = new Map();
        const allChildIds = new Set();

        // 1. Map & Collect Child Refs
        suites.forEach(s => {
            suiteMap.set(Number(s.id), s);

            // Normalize 'suites' (ADO) to 'children' (Renderer)
            if (s.suites && !s.children) {
                s.children = s.suites;
            }

            // If API provided children (from expand=true), collect their IDs
            if (s.children && s.children.length > 0) {
                s.children.forEach(child => {
                    const cId = child.id ? Number(child.id) : Number(child);
                    allChildIds.add(cId);
                });
            } else {
                // Ensure array exists if missing
                if (!s.children) s.children = [];
            }
        });

        // 2. Identify Roots (Items NOT referenced as children)
        // AND ensure we link objects if children are just IDs/partial objects
        suites.forEach(s => {
            // Re-map children to full objects from our map if possible
            // (API might return shallow objects in children array)
            if (s.children.length > 0) {
                s.children = s.children.map(child => {
                    const cId = child.id ? Number(child.id) : Number(child);
                    return suiteMap.get(cId) || child;
                });
            }

            // If this suite is NOT a child of any other suite, it is a Root.
            if (!allChildIds.has(Number(s.id))) {
                rootSuites.push(s);
            }
        });

        console.log(`[Hierarchy] Roots: ${rootSuites.length} (Total Fetched: ${suites.length})`);

        modalTreeContainer.innerHTML = "";

        // With asTreeView, we typically get one root suite containing the hierarchy
        // Render its children directly to show the structure
        if (suites.length > 0 && suites[0].children && suites[0].children.length > 0) {
            console.log(`[Hierarchy] Rendering ${suites[0].children.length} top-level suites from root`);
            renderModalSuiteTree(suites[0].children, modalTreeContainer, 0, plan);
        } else {
            // Fallback: render all suites as roots
            renderModalSuiteTree(suites, modalTreeContainer, 0, plan);
        }

    } catch (err) {
        modalTreeContainer.innerHTML = `<div style="color:var(--danger); padding:12px;">Failed to load suites: ${err.message}</div>`;
    }
} */

// 5. Suite Renderer
function renderModalSuiteTree(suites, container, depth, plan) {
    suites.forEach(suite => {
        const row = document.createElement("div");
        row.className = "suite-tree-item";
        row.style.paddingLeft = `${12 + (depth * 20)}px`;

        const hasChildren = suite.children && suite.children.length > 0;

        const caret = document.createElement("span");
        caret.className = "caret-icon";
        // Use geometric shape for cleaner look
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
        // Indent children slightly more
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
                // Rotate caret
                caret.style.transform = isClosed ? "rotate(90deg)" : "rotate(0deg)";
                // Toggle folder icon
                icon.textContent = isClosed ? "📂" : "📁";

                // Lazy Render / Recursive Render ONLY if empty
                // This prevents re-rendering on collapse/expand
                if (childrenContainer.innerHTML === "") {
                    renderModalSuiteTree(suite.children, childrenContainer, depth + 1, plan);
                }
            }
        }
    });
}

// Fetch Suites Logic (Lazy Load)
// 6. Final Selection
async function selectSuite(plan, suite) {
    selectedSuiteId = suite.id;

    // Update Sidebar Context
    currentContextDisplay.innerHTML = `
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">${escapeHtml(plan.name)}</div>
        <div style="font-size:12px;">📁 ${escapeHtml(suite.name)}</div>
    `;
    currentContextDisplay.style.color = "var(--text-primary)";

    suitePickerModal.style.display = "none";

    // Reset button text
    openSuitePickerBtn.textContent = "Change Plan / Suite";

    await fetchTestCasesFromSuite();
}

createSuiteBtn.onclick = async () => {
    // Basic validation
    const inputs = validateInputs();
    if (!inputs || !selectedProject || !selectedPlanId) {
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
            project: selectedProject,
            planId: selectedPlanId,
            suiteName
        });

        log(`Suite "${suiteName}" created!`, "success");

        // If the modal is currently open on this plan, refresh it?
        // Ideally yes, but for now we can rely on user re-opening to see it.
        // Or if we want to be fancy, check if modal is open:
        if (suitePickerModal.style.display === "flex" && selectedPlanId) {
            // Find the plan object from cachedPlans?
            const plan = cachedPlans.find(p => p.id === selectedPlanId);
            if (plan) openModalForSuites(plan);
        }

    } catch (err) {
        log(`Failed to create suite: ${err.message}`, "error");
    }
};

createSuiteBtn.onclick = async () => {
    const inputs = validateInputs();
    if (!inputs || !selectedProject || !selectedPlanId) {
        alert("Please select a Project and Test Plan first.");
        return;
    }

    const suiteName = prompt("Enter new Suite Name:");
    if (!suiteName) return;

    try {
        log(`Creating suite "${suiteName}"...`);
        const newSuite = await window.api.createSuite({
            ...inputs,
            project: selectedProject,
            planId: selectedPlanId,
            suiteName
        });

        log(`Suite "${suiteName}" created!`, "success");
        await fetchSuites();

    } catch (err) {
        log(`Failed to create suite: ${err.message}`, "error");
    }
};

// ===============================
// FETCH TEST CASES FROM SUITE
// ===============================
async function fetchTestCasesFromSuite() {
    try {
        const inputs = validateInputs();
        if (!inputs || !selectedSuiteId) return;

        log("Loading test cases from suite...");
        existingTestCases = await window.api.fetchTestCasesFromSuite({
            ...inputs,
            project: selectedProject,
            planId: selectedPlanId,
            suiteId: selectedSuiteId
        });

        isEditingExisting = true;

        // Helper to strip HTML tags
        const stripHtml = (html) => {
            if (!html) return "";
            const tmp = document.createElement("DIV");
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || "";
        };

        testCases = existingTestCases.map(tc => ({
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

        renderTestCaseTable();
        log(`Loaded ${testCases.length} test cases`, "success");
    } catch (err) {
        log(`Failed to load test cases: ${err.message}`, "error");
        testCases = [];
        renderTestCaseTable();
    }
}

// ===============================
// EXCEL IMPORT / EXPORT
// ===============================
const exportExcelBtn = document.getElementById("exportExcel");

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

        testCases = isEditingExisting ? [...testCases, ...mapped] : mapped;
        renderTestCaseTable();

        log(`Loaded ${mapped.length} test cases from Excel`, "success");
    } catch (err) {
        log(`Failed to import Excel: ${err.message}`, "error");
    }
};

exportExcelBtn.onclick = async () => {
    if (!testCases.length) {
        alert("No test cases to export.");
        return;
    }

    try {
        const filePath = await window.api.saveExcelDialog();
        if (!filePath) return;

        log(`Exporting to Excel: ${filePath}`);

        // Ensure steps are serialized/clean before export if needed, 
        // but our table already holds the clean text in `tc.steps`, which is what valid Excel wants.
        await window.api.exportExcel({
            filePath,
            testCases
        });

        log("Export successful!", "success");
    } catch (err) {
        log(`Failed to export Excel: ${err.message}`, "error");
    }
};

// ===============================
// TABLE RENDER
// ===============================
// ===============================
// TABLE RENDER (Excel-like)
// ===============================
function renderTestCaseTable() {
    if (!testCases.length) {
        testCaseTable.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted)">
        No test cases loaded.
      </div>`;
        return;
    }

    testCaseTable.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="width:60px">ID</th>
          <th style="width:90px">Type</th>
          <th style="width:100px">State</th>
          <th style="width:300px">Assigned To</th>
          <th style="width:250px">Title</th>
          <th>Preconditions</th>
          <th>Steps</th>
          <th>Expected</th>
          <th style="width:80px">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${testCases.map((tc, i) => {
        const stateClass = tc.state ? `badge badge-${tc.state.toLowerCase()}` : "badge";
        const rowClass = tc.isExisting ? (tc._modified ? 'data-modified="true"' : "") : 'data-new="true"';

        // Use testType from Azure DevOps (not auto-detected)
        const type = tc.testType || "Positive";
        const typeClass = type === "Negative" ? "badge-negative" : "badge-positive";

        const stepsHtml = `
          <div class="step-list">
            ${(tc.steps || []).map((step, sIdx) => `
              <div class="step-item">
                <div class="step-num">${sIdx + 1}.</div>
                <textarea class="step-input" placeholder="Action" 
                    onchange="updateStep(${i}, ${sIdx}, 'action', this.value)">${escapeHtml(step.action)}</textarea>
                
                <textarea class="step-input" placeholder="Expected Result" 
                    onchange="updateStep(${i}, ${sIdx}, 'expected', this.value)">${escapeHtml(step.expected)}</textarea>
                
                <button class="btn-icon" onclick="removeStep(${i}, ${sIdx})" title="Remove Step">×</button>
              </div>
            `).join("")}
            <button class="btn-add-step" onclick="addStep(${i})">+ Add Step</button>
          </div>
        `;

        return `
          <tr ${rowClass} data-index="${i}">
            <td>${tc.isExisting ? "#" + tc.id : '<span class="badge badge-active">New</span>'}</td>
            
            <!-- Type Column -->
            <td><span class="badge ${typeClass}" onclick="toggleTestType(${i})" style="cursor:pointer;" title="Click to toggle">${type}</span></td>

            <!-- Read-only metadata -->
            <td><span class="${stateClass}">${escapeHtml(tc.state || "Design")}</span></td>
            
            <!-- Smart User Picker -->
            <td style="overflow:visible;"> <!-- overflow visible needed for dropdown -->
                <div class="user-dropdown-container">
                    <input 
                        id="assign-input-${i}"
                        class="assign-input" 
                        value="${escapeHtml(tc.assignedTo || "")}" 
                        placeholder="Search user..."
                        onfocus="handleUserSearch(this.value, ${i})"
                        oninput="handleUserSearch(this.value, ${i})"
                        onblur="hideUserListDelayed()"
                        autocomplete="off"
                        style="padding-right: 30px;"
                    />
                    
                    ${tc.assignedTo ? `
                    <button 
                        onclick="updateLocal(${i}, 'assignedTo', '')"
                        style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #9ca3af; cursor: pointer; padding: 4px;"
                        title="Clear Assignment"
                    >✕</button>
                    ` : `
                    <span style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #d1d5db; pointer-events:none;">🔍</span>
                    `}
                </div>
            </td>

            <!-- Editable Fields -->
            <td contenteditable="true" 
                onblur="updateLocal(${i}, 'title', this.innerText)">${escapeHtml(tc.title)}</td>
            
            <td contenteditable="true" 
                onblur="updateLocal(${i}, 'preconditions', this.innerText)">${escapeHtml(tc.preconditions)}</td>
            
            <!-- Steps Editor -->
            <td>${stepsHtml}</td>
            
            <td contenteditable="true" 
                onblur="updateLocal(${i}, 'expected', this.innerText)">${escapeHtml(tc.expected)}</td>
            
            <!-- Actions -->
            <td style="text-align:center;">
              <div style="display:flex;gap:4px;justify-content:center;">
                  <button class="action-btn save-action" onclick="saveTestCase(${i})" title="Save">
                    💾
                  </button>
                  <button class="action-btn delete-action" onclick="deleteTestCase(${i})" title="Delete">
                    🗑️
                  </button>
              </div>
            </td>
          </tr>
        `;
    }).join("")}
      </tbody>
    </table>
  `;
}

// ===============================
// ROW ACTIONS
// ===============================
// ===============================
// ROW ACTIONS
// ===============================
window.updateLocal = (i, field, value) => {
    // Determine if value actually changed
    if (testCases[i][field] !== value) {
        testCases[i][field] = value;
        testCases[i]._modified = true;

        // Find the row and mark it as modified visually
        // Do NOT call renderTestCaseTable() here as it kills focus/cursor position
        const row = document.querySelector(`tr[data-index="${i}"]`);
        if (row) {
            if (testCases[i].isExisting) {
                row.setAttribute('data-modified', 'true');
            } else {
                row.setAttribute('data-new', 'true');
            }
        }
    }
};

window.updateStep = (tcIndex, stepIndex, field, value) => {
    const steps = testCases[tcIndex].steps;
    if (!steps[stepIndex]) return;

    if (steps[stepIndex][field] !== value) {
        steps[stepIndex][field] = value;
        testCases[tcIndex]._modified = true;
        // Mark row modified visually without full re-render which kills focus
        const row = document.querySelector(`tr[data-index="${tcIndex}"]`);
        if (row && testCases[tcIndex].isExisting) {
            row.setAttribute('data-modified', 'true');
        }
    }
};

window.toggleTestType = (tcIndex) => {
    const tc = testCases[tcIndex];
    tc.testType = tc.testType === "Positive" ? "Negative" : "Positive";
    tc._modified = true;
    renderTestCaseTable();
};

window.addStep = (tcIndex) => {
    if (!testCases[tcIndex].steps) testCases[tcIndex].steps = [];
    testCases[tcIndex].steps.push({ action: "", expected: "" });
    testCases[tcIndex]._modified = true;
    renderTestCaseTable();
};

window.removeStep = (tcIndex, stepIndex) => {
    testCases[tcIndex].steps.splice(stepIndex, 1);
    testCases[tcIndex]._modified = true;
    renderTestCaseTable();
};

renderTestCaseTable();

window.saveTestCase = async (i) => {
    const tc = testCases[i];
    const inputs = validateInputs();
    if (!tc?.id || !inputs) return;

    try {
        const finalSteps = serializeSteps(tc.steps);

        log(`Saving test case #${tc.id}...`);
        // Resolve display name to unique name (email) if possible
        // FIX: Use Display Name directly (same as creation logic)
        const resolvedAssignedTo = tc.assignedTo;

        await window.api.updateTestCase({
            ...inputs,
            project: selectedProject,
            testCaseId: tc.id,
            data: {
                title: tc.title,
                preconditions: tc.preconditions,
                steps: finalSteps,
                expected: tc.expected,
                testType: tc.testType,
                assignedTo: resolvedAssignedTo
            }
        });
        tc._modified = false;
        log(`Saved test case #${tc.id}`, "success");
        renderTestCaseTable();
    } catch (err) {
        log(`Failed to save test case #${tc.id}: ${err.message}`, "error");
        console.error("Save error:", err);
    }
};

window.deleteTestCase = (i) => {
    if (!confirm("Delete this test case?")) return;
    testCases.splice(i, 1);
    renderTestCaseTable();
};

// ===============================
// STEPS PARSING (ADO XML <-> TEXT)
// ===============================
function parseSteps(xmlOrText) {
    // If null/undefined, return empty array
    if (!xmlOrText) return [];

    // If it's already an array (safety), return it
    if (Array.isArray(xmlOrText)) return xmlOrText;

    // If it's not XML, treat as a single plain text step
    if (typeof xmlOrText === 'string' && !xmlOrText.includes("<steps")) {
        // If it's just a string, wrapping it in one step is safer than failing
        return [{ action: xmlOrText, expected: "" }];
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlOrText, "text/xml");
        const steps = Array.from(doc.getElementsByTagName("step"));

        return steps.map((step) => {
            const params = step.getElementsByTagName("parameterizedString");
            let action = params[0]?.textContent || "";
            let expected = params[1]?.textContent || "";

            // Helper to strip HTML tags if ADO stores rich text
            const clean = html => {
                const tmp = document.createElement("div");
                tmp.innerHTML = html;
                return tmp.textContent || tmp.innerText || "";
            };

            return {
                action: clean(action).trim(),
                expected: clean(expected).trim()
            };
        });
    } catch (e) {
        console.error("Failed to parse steps XML", e);
        // Fallback on error
        return [{ action: "Error parsing steps", expected: "" }];
    }
}

function serializeSteps(stepsArray) {
    if (!Array.isArray(stepsArray)) {
        console.warn("serializeSteps received non-array:", stepsArray);
        return stepsArray;
    }

    let stepsXml = `<steps id="0" last="${stepsArray.length}">`;

    stepsArray.forEach((step, index) => {
        const action = step.action || "";
        const expected = step.expected || "";

        stepsXml += `
      <step id="${index + 2}" type="ActionStep">
        <parameterizedString isformatted="true">${escapeXml(action)}</parameterizedString>
        <parameterizedString isformatted="true">${escapeXml(expected)}</parameterizedString>
        <description/>
      </step>`;
    });

    stepsXml += `</steps>`;
    return stepsXml;
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// ===============================
// ADD NEW
// ===============================
addNewTestCaseBtn.onclick = () => {
    testCases.push({
        title: "",
        preconditions: "",
        steps: [{ action: "", expected: "" }], // Default structured step
        expected: "",
        assignedTo: "", // Default unassigned
        isExisting: false
    });
    renderTestCaseTable();
};

// ===============================
// SUBMIT NEW TEST CASES
// ===============================
submitTestCasesBtn.onclick = async () => {
    try {
        const inputs = validateInputs();
        if (!inputs || !selectedSuiteId) return;

        const newCases = testCases.filter(tc => !tc.isExisting);
        if (!newCases.length) {
            alert("No new test cases to submit.");
            return;
        }

        submitTestCasesBtn.disabled = true;
        log(`Creating ${newCases.length} test cases...`);

        // Prepare proper creation payload with resolved user
        const payloadCases = newCases.map(tc => {
            // FIX: Use Display Name directly. 
            // Azure DevOps REST API prefers Display Name for System.AssignedTo 
            // and resolves it internally. Using uniqueName (alias) often fails.
            const resolvedAssignedTo = tc.assignedTo;

            return {
                ...tc,
                steps: serializeSteps(tc.steps),
                assignedTo: resolvedAssignedTo
            };
        });

        const created = await window.api.createTestCases({
            ...inputs,
            project: selectedProject,
            testCases: payloadCases,
            project: selectedProject,
            testCases: payloadCases,
            userStoryId: null // Force null as feature is removed
        });

        // specific filter for successful creations
        const successfulIds = created
            .filter(c => c.success && c.id)
            .map(c => c.id);

        if (successfulIds.length > 0) {
            await window.api.addTestCaseToSuite({
                ...inputs,
                project: selectedProject,
                planId: selectedPlanId,
                suiteId: selectedSuiteId,
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

// ===============================
// HELPER: Determine Test Type
// ===============================
function getTestType(title) {
    if (!title) return "Positive";
    const lower = title.toLowerCase();
    const negativeKeywords = ["error", "fail", "invalid", "cannot", "not allowed", "reject", "deny", "unable", "exception", "validation"];

    if (negativeKeywords.some(kw => lower.includes(kw))) {
        return "Negative";
    }
    return "Positive";
}

// ============================================
// FIX: Recursive Suite Hierarchy Implementation
// ============================================
async function openModalForSuitesRecursive(plan) {
    selectedPlanId = plan.id;

    modalTitle.textContent = `Suites in "${plan.name}"`;
    modalBackContainer.style.display = "block";

    // Back Button Logic
    modalBackBtn.onclick = () => {
        openModalForPlans();
    };

    // Enable "Create Suite"
    createSuiteBtn.style.display = "block";

    const cacheKey = `${selectedProject}-${plan.id}`;

    // Check cache first
    if (suiteHierarchyCache.has(cacheKey)) {
        console.log(`[Cache] Using cached hierarchy for plan ${plan.id}`);
        const rootSuite = suiteHierarchyCache.get(cacheKey);
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
    modalTreeContainer.innerHTML = `<div style="padding:12px; text-align:center;">
        <div>Loading hierarchy...</div>
        <div id="hierarchyProgress" style="margin-top:8px; color:var(--text-muted); font-size:12px;">Starting...</div>
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
            project: selectedProject,
            planId: plan.id
        });

        console.log(`[Hierarchy] Fetched complete tree for plan ${plan.id}`);

        // Cache the result
        suiteHierarchyCache.set(cacheKey, rootSuite);

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
