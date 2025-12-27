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

    cases.forEach(testCase => {
        const card = document.createElement('div');
        card.className = 'review-card';
        // Format steps for display (briefly)
        const stepCount = testCase.steps ? testCase.steps.length : 0;

        card.innerHTML = `
            <h4>${testCase.title}</h4>
            <div class="meta">
                <span>By: ${testCase.author_name || 'Unknown'}</span>
                <span>${stepCount} Steps</span>
            </div>
            <div class="review-actions">
                <button class="btn-approve" data-id="${testCase.id}">Approve</button>
                <button class="btn-reject" data-id="${testCase.id}">Reject</button>
            </div>
        `;

        // Add listeners
        card.querySelector('.btn-approve').onclick = () => approveCase(testCase);
        card.querySelector('.btn-reject').onclick = () => rejectCase(testCase.id);

        reviewList.appendChild(card);
    });
}

async function approveCase(testCase) {
    if (!state.selectedSuiteId) {
        alert("Please go to 'Test Manager' and select a Target Suite first!");
        return;
    }

    if (!confirm(`Approve "${testCase.title}" and push to current suite?`)) return;

    try {
        log(`Approving and pushing "${testCase.title}"...`);

        // 1. Push to Azure
        // We need to format it to match what createTestCases expects
        // It expects an array of { title, steps, ... }
        // state.testCases has a specific format. 
        // We need to reconstruct the payload.

        const payloadCase = {
            title: testCase.title,
            steps: testCase.steps.map(s => ({
                action: s.action,
                expected: s.expected
            })),
            expected: testCase.expected_result,
            assignedTo: state.selectedProject // Or current user? Maybe leave unassigned
        };

        const inputs = {
            orgUrl: document.getElementById('org').value,
            pat: document.getElementById('pat').value
        };

        if (testCase.azure_id) {
            // === UPDATE EXISTING CASE ===
            log(`Updating existing Azure Case ${testCase.azure_id}...`);

            // We need to format data for updateTestCase
            // Usually expects: { testCaseId, data: { title, steps, ... } }

            // Serialize steps properly
            // Note: serializeSteps is imported in main-renderer, might not be here.
            // Let's do a simple map or import it. Simple map for now to match structure.
            const stepsXML = ''; // If we need XML, we rely on backend helper. 
            // Actually, main-renderer uses serializeSteps before sending. 
            // But window.api.createTestCases handles step serialization if we passed raw steps?
            // Let's check main.js. createTestCase helper does serialization.
            // updateTestCase also expects fields.

            // NOTE: updateTestCase in services/azureClient.js likely expects "steps" as a specially formatted array or HTML.
            // Let's try sending the raw steps array and hope the backend service handles it (like createTestCase does).
            // If NOT, we might need to inspect azureClient.js.
            // For now, assuming updateTestCase signature: { testCaseId, data: { ...fields } }

            const result = await window.api.updateTestCase({
                ...inputs,
                project: state.selectedProject,
                testCaseId: testCase.azure_id,
                data: {
                    title: testCase.title,
                    steps: serializeSteps(testCase.steps), // Serialized to XML
                    expected: testCase.expected_result
                }
            });

            log(`Successfully updated Case ${testCase.azure_id}.`, 'success');
            // 3. Update Backend Status
            await apiClient.updateCaseStatus(testCase.id, 'APPROVED');
            loadReviews(); // Refresh list
            return;

        } else {
            // === CREATE NEW CASE ===
            // Reuse window.api.createTestCases logic
            const created = await window.api.createTestCases({
                ...inputs,
                project: state.selectedProject,
                testCases: [payloadCase],
                userStoryId: null
            });

            if (created && created[0] && created[0].success) {
                const azId = created[0].id;

                // 2. Link to Suite
                await window.api.addTestCaseToSuite({
                    ...inputs,
                    project: state.selectedProject,
                    planId: state.selectedPlanId,
                    suiteId: state.selectedSuiteId,
                    testCaseIds: [azId]
                });

                // 3. Update Backend Status
                await apiClient.updateCaseStatus(testCase.id, 'APPROVED');

                log(`Successfully pushed Case ${azId} and marked as Approved.`, 'success');
                loadReviews(); // Refresh list
            } else {
                throw new Error(created[0]?.error || "Unknown Azure Error");
            }
        }

    } catch (err) {
        log(`Failed to approve case: ${err.message}`, 'error');
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
