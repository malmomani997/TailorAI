import { apiClient } from './apiClient.js';
import { refreshReviewsBtn, reviewList } from './elements.js';
import { state } from './state.js';
import { log } from './ui-helpers.js';
import { serializeSteps } from './table.js';

export function initReviewDashboard() {
    refreshReviewsBtn.onclick = loadReviews;
}

export async function loadReviews() {
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        reviewList.innerHTML = '<p>Loading...</p>';

        // Fetch cases: PENDING + (Assigned to Me OR My Org)
        const cases = await apiClient.getCases({
            status: 'PENDING',
            reviewerId: user.id, // Only show cases assigned to me
            orgUrl: user.orgUrl  // Ensure org safety
        });
        renderReviews(cases);
    } catch (error) {
        log(`Failed to load reviews: ${error.message}`, 'error');
        reviewList.innerHTML = '<p style="color:red">Error loading reviews</p>';
    }
}

function renderReviews(cases) {
    reviewList.innerHTML = '';

    if (cases.length === 0) {
        reviewList.innerHTML = `
            <div class="empty-state">
                <h3>No Pending Reviews</h3>
            </div>
        `;
        return;
    }

    // Group cases by Suite + Author (Simulating a Pull Request)
    const batches = {};
    cases.forEach(c => {
        const key = `${c.suite_id}_${c.author_id}`;
        if (!batches[key]) {
            batches[key] = {
                suiteId: c.suite_id,
                suiteTitle: c.suite_title || 'Unknown Suite',
                authorId: c.author_id,
                authorName: c.author_name,
                items: []
            };
        }
        batches[key].items.push(c);
    });

    // Render Batch Cards
    Object.values(batches).forEach(batch => {
        const batchCard = document.createElement('div');
        batchCard.className = 'pr-card'; // Using existing GitHub style wrapper

        const changeCount = batch.items.length;
        const noun = changeCount === 1 ? 'change' : 'changes';

        batchCard.innerHTML = `
            <div class="pr-header" style="background:var(--gh-bg-secondary); border-bottom:1px solid var(--gh-border);">
                <div class="pr-icon">
                   <svg class="icon-open" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 0 0 0 16.036V16a.75.75 0 0 0 1.5 0v3.463A8 8 0 0 0 8 0ZM2.5 8a5.5 5.5 0 1 0 11 0 5.5 5.5 0 0 0-11 0Z"></path></svg>
                </div>
                <div class="pr-main">
                    <div class="pr-title" style="font-size:16px;">
                        Changes in Suite: <strong>${batch.suiteTitle}</strong>
                    </div>
                    <div class="pr-meta">
                        Proposed by <strong>${batch.authorName}</strong> • ${changeCount} ${noun}
                    </div>
                </div>
                <!-- Approve All Action -->
                <button class="btn-gh-primary btn-approve-batch" style="height:28px; font-size:12px;">Approve All (${changeCount})</button>
            </div>
            
            <div class="pr-content-wrapper">
                <!-- Inner Items injected here -->
            </div>
        `;

        const container = batchCard.querySelector('.pr-content-wrapper');

        // Render Individual Items Inside
        batch.items.forEach(testCase => {
            const itemDiv = document.createElement('div');
            itemDiv.style.borderBottom = '1px solid var(--gh-border)';
            itemDiv.style.padding = '12px 16px';

            const isUpdate = !!testCase.azure_id;
            const typeLabel = isUpdate ? 'Update' : 'New';
            const typeColor = isUpdate ? 'var(--gh-link)' : 'var(--gh-state-open)';

            const stepsRows = (testCase.steps || []).map((step, i) => `
                <tr>
                    <td class="blob-num" style="min-width:20px;">${i + 1}</td>
                    <td class="blob-code"><strong>${step.action || ''}</strong></td>
                    <td class="blob-code">${step.expected || ''}</td>
                </tr>
            `).join('');

            itemDiv.innerHTML = `
                <details>
                    <summary style="cursor:pointer; outline:none; font-size:14px; font-weight:600; display:flex; gap:8px; align-items:center;">
                        <span style="font-size:10px; border:1px solid ${typeColor}; color:${typeColor}; padding:1px 4px; border-radius:4px;">${typeLabel}</span>
                        <span>${testCase.title}</span>
                        <span style="font-weight:400; color:var(--gh-text-muted); font-size:12px;">${isUpdate ? `#${testCase.azure_id}` : ''}</span>
                    </summary>
                    
                    <div style="margin-top:12px; padding-left:12px; border-left:2px solid var(--gh-border);">
                         <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:12px;">
                            <div>
                                <strong style="color:#57606a;">Test Type:</strong> ${testCase.test_type || 'Positive'}
                            </div>
                            <div>
                                <strong style="color:#57606a;">Suite ID:</strong> ${testCase.suite_id || 'N/A'}
                            </div>
                         </div>

                         <div style="font-size:12px; margin-bottom:8px;">
                            <strong>Preconditions:</strong>
                            <p style="margin:4px 0 0 0; white-space:pre-wrap;">${testCase.preconditions || 'None'}</p>
                         </div>
                         
                         <div style="font-size:12px; margin-bottom:8px;">
                            <strong>Expected Result:</strong> ${testCase.expected_result || 'N/A'}
                         </div>

                         <table class="pr-code-block" style="width:100%; margin-top:8px;">
                            <thead><tr><th></th><th>Action</th><th>Expected</th></tr></thead>
                            <tbody>${stepsRows}</tbody>
                         </table>
                         
                         <div style="margin-top:8px; text-align:right;">
                            <button class="btn-gh-danger" style="font-size:11px; padding:2px 8px;" onclick="window.rejectIndividual(${testCase.id})">Reject This Item</button>
                         </div>
                    </div>
                </details>
            `;
            container.appendChild(itemDiv);
        });

        // Approve Batch Logic
        batchCard.querySelector('.btn-approve-batch').onclick = async () => {
            if (!confirm(`Approve all ${changeCount} changes in "${batch.suiteTitle}"?`)) return;
            await approveBatch(batch);
        };

        reviewList.appendChild(batchCard);
    });

    // Helper for individual reject
    window.rejectIndividual = (id) => rejectCase(id);
}

async function approveBatch(batch) {
    try {
        log(`Approving batch for ${batch.suiteTitle}...`);

        for (const testCase of batch.items) {
            await approveCase(testCase, batch.suiteId);
        }

        log("Batch approved successfully!", "success");
        loadReviews();
    } catch (err) {
        log(`Batch approval failed: ${err.message}`, "error");
    }
}

async function approveCase(testCase, suiteIdOverride) {
    // If suiteId is passed (Batch Mode), use it. otherwise check state.
    // Actually, createDraft should have saved suite_id in the DB case record.
    // So testCase.suite_id SHOULD be the source of truth if available.
    // Fallback to suiteIdOverride or state.selectedSuiteId.

    const targetSuiteId = testCase.suite_id || suiteIdOverride || state.selectedSuiteId;

    // For assignedTo (Project Area), we need Project Name.
    // If we are in multi-project env, we might need to store project in DB too.
    // For now, assume state.selectedProject if logged in user is in that project context.
    const targetProject = state.selectedProject;

    log(`Approving "${testCase.title}" (Suite: ${targetSuiteId})...`);

    const inputs = {
        orgUrl: document.getElementById('org').value,
        pat: document.getElementById('pat').value
    };

    try {
        if (testCase.azure_id) {
            // UPDATE
            await window.api.updateTestCase({
                ...inputs,
                project: targetProject,
                testCaseId: testCase.azure_id,
                data: {
                    title: testCase.title,
                    steps: serializeSteps(testCase.steps),
                    expected: testCase.expected_result,
                    preconditions: testCase.preconditions,
                    testType: testCase.test_type
                }
            });
        } else {
            // CREATE
            const payloadCase = {
                title: testCase.title,
                steps: serializeSteps(testCase.steps),
                expected: testCase.expected_result,
                assignedTo: targetProject,
                preconditions: testCase.preconditions,
                testType: testCase.test_type
            };

            const created = await window.api.createTestCases({
                ...inputs,
                project: targetProject,
                testCases: [payloadCase],
                userStoryId: null
            });

            if (created && created[0] && created[0].success) {
                await window.api.addTestCaseToSuite({
                    ...inputs,
                    project: targetProject,
                    planId: state.selectedPlanId || "RequiredPlanId?", // Potential Issue if Plan ID not known?
                    // Actually, 'addTestCaseToSuite' usually needs PlanID + SuiteID.
                    // If we don't have PlanID from DB, we might fail unless API allows just SuiteID (some versions do).
                    // Let's hope state.selectedPlanId is correct context.
                    suiteId: targetSuiteId,
                    testCaseIds: [created[0].id]
                });
            } else {
                throw new Error(created?.[0]?.error || "Azure Creation Failed");
            }
        }
        // Update DB
        await apiClient.updateCaseStatus(testCase.id, 'APPROVED');
    } catch (err) {
        log(`Err approving ${testCase.title}: ${err.message}`, "error");
        // Don't rethrow, just log, so batch continues? Or stop?
        // Let's stop to be safe.
        throw err;
    }
}

async function rejectCase(id) {
    if (!confirm("Reject this test case?")) return;
    try {
        await apiClient.updateCaseStatus(id, 'REJECTED');
        log('Case rejected.', 'warning');
        loadReviews();
    } catch (err) {
        log(`Failed to reject: ${err.message}`, 'error');
    }
}
