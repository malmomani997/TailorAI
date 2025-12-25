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
const testPlanSelect = document.getElementById("testPlans");
const suiteSelect = document.getElementById("suites");

const consoleBox = document.getElementById("console");
const testCaseTable = document.getElementById("testCaseTable");

const importExcelBtn = document.getElementById("importExcel");
const submitTestCasesBtn = document.getElementById("submitTestCases");
const addNewTestCaseBtn = document.getElementById("addNewTestCase");
const userStoryIdInput = document.getElementById("userStoryId");

// -------------------------------
// State
// -------------------------------
let selectedProject = null;
let selectedPlanId = null;
let selectedSuiteId = null;

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
loadProjectsBtn.onclick = async () => {
    try {
        const inputs = validateInputs();
        if (!inputs) return;

        log("Fetching projects...");
        const projects = await window.api.fetchProjects(inputs);

        projectSelect.innerHTML = `<option disabled selected>Select Project</option>`;
        testPlanSelect.innerHTML = "";
        suiteSelect.innerHTML = "";

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

projectSelect.onchange = async () => {
    selectedProject = projectSelect.value;
    selectedPlanId = null;
    selectedSuiteId = null;

    testPlanSelect.innerHTML = "";
    suiteSelect.innerHTML = "";

    await fetchTestPlans();
};

// ===============================
// TEST PLANS
// ===============================
async function fetchTestPlans() {
    try {
        const inputs = validateInputs();
        if (!inputs || !selectedProject) return;

        log("Fetching test plans...");
        const plans = await window.api.fetchTestPlans({
            ...inputs,
            project: selectedProject
        });

        testPlanSelect.innerHTML = `<option disabled selected>Select Test Plan</option>`;
        suiteSelect.innerHTML = "";

        plans.forEach(plan => {
            const opt = document.createElement("option");
            opt.value = plan.id;
            opt.textContent = plan.name;
            testPlanSelect.appendChild(opt);
        });

        log(`Loaded ${plans.length} test plans`, "success");
    } catch (err) {
        log(`Failed to load test plans: ${err.message}`, "error");
    }
}

testPlanSelect.onchange = async () => {
    selectedPlanId = Number(testPlanSelect.value);
    selectedSuiteId = null;

    suiteSelect.innerHTML = "";
    await fetchSuites();
};

// ===============================
// SUITES
// ===============================
async function fetchSuites() {
    try {
        const inputs = validateInputs();
        if (!inputs || !selectedPlanId) return;

        log("Fetching test suites...");
        const suites = await window.api.fetchSuites({
            ...inputs,
            project: selectedProject,
            planId: selectedPlanId
        });

        suiteSelect.innerHTML = `<option disabled selected>Select Suite</option>`;

        suites.forEach(suite => {
            const opt = document.createElement("option");
            opt.value = suite.id;
            opt.textContent = suite.name;
            suiteSelect.appendChild(opt);
        });

        log(`Loaded ${suites.length} suites`, "success");
    } catch (err) {
        log(`Failed to load suites: ${err.message}`, "error");
    }
}

suiteSelect.onchange = async () => {
    selectedSuiteId = Number(suiteSelect.value);
    await fetchTestCasesFromSuite();
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
          <th style="width:150px">Assigned To</th>
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
            <td style="font-size:12px;color:var(--muted)">${escapeHtml(tc.assignedTo || "-")}</td>

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
    if (testCases[i][field] !== value) {
        testCases[i][field] = value;
        testCases[i]._modified = true;
        renderTestCaseTable();
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

window.saveTestCase = async (i) => {
    const tc = testCases[i];
    const inputs = validateInputs();
    if (!tc?.id || !inputs) return;

    try {
        const finalSteps = serializeSteps(tc.steps);

        log(`Saving test case #${tc.id}...`);
        await window.api.updateTestCase({
            ...inputs,
            project: selectedProject,
            testCaseId: tc.id,
            data: {
                title: tc.title,
                preconditions: tc.preconditions,
                steps: finalSteps,
                expected: tc.expected,
                testType: tc.testType
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

        // Prepare proper XML for creation
        const payloadCases = newCases.map(tc => ({
            ...tc,
            steps: serializeSteps(tc.steps)
        }));

        const created = await window.api.createTestCases({
            ...inputs,
            project: selectedProject,
            testCases: payloadCases,
            userStoryId: userStoryIdInput.value || null
        });

        await window.api.addTestCaseToSuite({
            ...inputs,
            project: selectedProject,
            planId: selectedPlanId,
            suiteId: selectedSuiteId,
            testCaseIds: created.map(c => c.id)
        });

        log(`Added ${created.length} test cases to suite`, "success");
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
