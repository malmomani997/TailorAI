
import { state } from './state.js';
import { testCaseTable } from './elements.js';
import { escapeHtml, escapeXml, validateInputs, log } from './ui-helpers.js';
import { handleUserSearch, hideUserListDelayed } from './user-search.js'; // Ensure these are imported so they are available, though they are window bound

export function renderTestCaseTable() {
    if (!state.testCases.length) {
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
        ${state.testCases.map((tc, i) => {
        const stateClass = tc.state ? `badge badge-${tc.state.toLowerCase()}` : "badge";
        const rowClass = tc.isExisting ? (tc._modified ? 'data-modified="true"' : "") : 'data-new="true"';

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
            <td style="overflow:visible;">
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

// Window functions
window.updateLocal = (i, field, value) => {
    if (state.testCases[i][field] !== value) {
        state.testCases[i][field] = value;
        state.testCases[i]._modified = true;
        const row = document.querySelector(`tr[data-index="${i}"]`);
        if (row) {
            if (state.testCases[i].isExisting) {
                row.setAttribute('data-modified', 'true');
            } else {
                row.setAttribute('data-new', 'true');
            }
        }
    }
};

window.updateStep = (tcIndex, stepIndex, field, value) => {
    const steps = state.testCases[tcIndex].steps;
    if (!steps[stepIndex]) return;

    if (steps[stepIndex][field] !== value) {
        steps[stepIndex][field] = value;
        state.testCases[tcIndex]._modified = true;
        const row = document.querySelector(`tr[data-index="${tcIndex}"]`);
        if (row && state.testCases[tcIndex].isExisting) {
            row.setAttribute('data-modified', 'true');
        }
    }
};

window.toggleTestType = (tcIndex) => {
    const tc = state.testCases[tcIndex];
    tc.testType = tc.testType === "Positive" ? "Negative" : "Positive";
    tc._modified = true;
    renderTestCaseTable();
};

window.addStep = (tcIndex) => {
    if (!state.testCases[tcIndex].steps) state.testCases[tcIndex].steps = [];
    state.testCases[tcIndex].steps.push({ action: "", expected: "" });
    state.testCases[tcIndex]._modified = true;
    renderTestCaseTable();
};

window.removeStep = (tcIndex, stepIndex) => {
    state.testCases[tcIndex].steps.splice(stepIndex, 1);
    state.testCases[tcIndex]._modified = true;
    renderTestCaseTable();
};

window.saveTestCase = async (i) => {
    const tc = state.testCases[i];
    const inputs = validateInputs();
    if (!tc?.id || !inputs) return;

    try {
        const finalSteps = serializeSteps(tc.steps);
        log(`Saving test case #${tc.id}...`);

        await window.api.updateTestCase({
            ...inputs,
            project: state.selectedProject,
            testCaseId: tc.id,
            data: {
                title: tc.title,
                preconditions: tc.preconditions,
                steps: finalSteps,
                expected: tc.expected,
                testType: tc.testType,
                assignedTo: tc.assignedTo
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
    state.testCases.splice(i, 1);
    renderTestCaseTable();
};

export function serializeSteps(stepsArray) {
    if (!Array.isArray(stepsArray)) return stepsArray;
    let stepsXml = `<steps id="0" last="${stepsArray.length}">`;
    stepsArray.forEach((step, index) => {
        stepsXml += `
      <step id="${index + 2}" type="ActionStep">
        <parameterizedString isformatted="true">${escapeXml(step.action || "")}</parameterizedString>
        <parameterizedString isformatted="true">${escapeXml(step.expected || "")}</parameterizedString>
        <description/>
      </step>`;
    });
    stepsXml += `</steps>`;
    return stepsXml;
}

export function parseSteps(xmlOrText) {
    if (!xmlOrText) return [];
    if (Array.isArray(xmlOrText)) return xmlOrText;
    if (typeof xmlOrText === 'string' && !xmlOrText.includes("<steps")) {
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
        return [{ action: "Error parsing steps", expected: "" }];
    }
}
