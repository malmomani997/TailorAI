const azdev = require("azure-devops-node-api");
const axios = require("axios");

/**
 * Azure DevOps on-prem + DefaultCollection + FortiGate
 * requires SDK + PAT + TLS disabled at process level
 */

function getConnection(orgUrl, pat) {
    const authHandler = azdev.getPersonalAccessTokenHandler(pat);
    return new azdev.WebApi(orgUrl, authHandler);
}

/* ================= PROJECTS ================= */

async function fetchProjects(orgUrl, pat) {
    const connection = getConnection(orgUrl, pat);
    const coreApi = await connection.getCoreApi();

    const iterator = await coreApi.getProjects();
    const projects = [];

    for await (const p of iterator) {
        projects.push({
            name: p.name,
            id: p.id
        });
    }

    return projects;
}

/* ================= TEST PLANS ================= */

async function fetchTestPlans(orgUrl, project, pat) {
    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestPlanApi();

    return await testApi.getTestPlans(project);
}

/* ================= SUITES ================= */

async function fetchSuites(orgUrl, project, planId, pat) {
    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestPlanApi();

    return await testApi.getTestSuitesForPlan(project, planId);
}

async function createSuite(orgUrl, project, planId, suiteName, pat) {
    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestPlanApi();

    return await testApi.createTestSuite(
        { name: suiteName, suiteType: "StaticTestSuite" },
        project,
        planId
    );
}

/* ================= TEST CASES ================= */

async function createTestCase({ orgUrl, project, pat, userStoryId, data }) {
    const connection = getConnection(orgUrl, pat);
    const witApi = await connection.getWorkItemTrackingApi();

    const patch = [
        { op: "add", path: "/fields/System.Title", value: data.title }
    ];

    if (data.steps) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.Steps", value: data.steps });
    }

    if (data.preconditions) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Preconditions", value: data.preconditions });
    }

    if (data.expected) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.ExpectedResult", value: data.expected });
    }

    // Only add user story relation if userStoryId is provided
    if (userStoryId) {
        patch.push({
            op: "add",
            path: "/relations/-",
            value: {
                rel: "Microsoft.VSTS.Common.TestedBy-Reverse",
                url: `${orgUrl}/${project}/_apis/wit/workitems/${userStoryId}`
            }
        });
    }

    const result = await witApi.createWorkItem(
        null,
        patch,
        project,
        "Test Case"
    );

    return result.id;
}

async function addTestCaseToSuite(orgUrl, project, planId, suiteId, testCaseId, pat) {
    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestPlanApi();

    await testApi.addTestCasesToSuite(
        project,
        planId,
        suiteId,
        [{ workItem: { id: testCaseId } }]
    );
}

async function fetchTestCasesFromSuite(orgUrl, project, planId, suiteId, pat) {
    const connection = getConnection(orgUrl, pat);

    const testApi = await connection.getTestApi();
    const witApi = await connection.getWorkItemTrackingApi();

    // ✅ THIS IS THE CORRECT METHOD IN YOUR SDK
    const testPoints = await testApi.getPoints(
        project,
        planId,
        suiteId
    );

    console.log(`Found ${testPoints?.length || 0} test points`);
    if (!testPoints || testPoints.length === 0) return [];

    console.log(
        "First test point structure:",
        JSON.stringify(testPoints[0], null, 2)
    );

    // Extract Test Case Work Item IDs
    const workItemIds = testPoints
        .map(p => p?.testCase?.id)
        .filter(Boolean)
        .map(id => Number(id))
        .filter(Number.isFinite);

    console.log("Extracted work item IDs:", workItemIds);
    if (workItemIds.length === 0) return [];

    // Request ALL fields to discover what's available
    // Pass undefined for fields parameter to get all fields
    const workItems = [];
    const chunkSize = 200;

    for (let i = 0; i < workItemIds.length; i += chunkSize) {
        const chunk = workItemIds.slice(i, i + chunkSize);
        try {
            const batch = await witApi.getWorkItems(
                chunk,
                undefined, // Get ALL fields
                undefined,
                undefined
            );
            workItems.push(...batch);
        } catch (err) {
            console.error(`Error fetching batch ${i} to ${i + chunkSize}:`, err);
            // non-fatal, continue to next batch
        }
    }

    return workItems.map(wi => ({
        id: wi.id,
        title: wi.fields?.["System.Title"] || "",
        state: wi.fields?.["System.State"] || "",
        assignedTo: wi.fields?.["System.AssignedTo"]?.displayName || wi.fields?.["System.AssignedTo"] || "",
        workItemType: wi.fields?.["System.WorkItemType"] || "",
        steps: wi.fields?.["Microsoft.VSTS.TCM.Steps"] || "",
        expected: wi.fields?.["Microsoft.VSTS.TCM.ExpectedResults"] || "",
        preconditions: wi.fields?.["Microsoft.VSTS.TCM.ReproSteps"] || "", // Use Repro Steps as Preconditions
        testType: wi.fields?.["Microsoft.VSTS.Common.Type"] || "Positive",
        automationStatus: wi.fields?.["Microsoft.VSTS.TCM.AutomationStatus"] || "",
        createdDate: wi.fields?.["System.CreatedDate"] || null,
        changedDate: wi.fields?.["System.ChangedDate"] || null
    }));
}



async function updateTestCase({ orgUrl, project, pat, testCaseId, data }) {
    const connection = getConnection(orgUrl, pat);
    const witApi = await connection.getWorkItemTrackingApi();

    const patch = [];

    // 'add' operation works as an upsert (create if null, update if exists)
    // using 'add' is safer than 'replace' for fields that might be empty

    if (data.title !== undefined) {
        patch.push({ op: "add", path: "/fields/System.Title", value: data.title });
    }

    if (data.steps !== undefined) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.Steps", value: data.steps || "" });
    }

    // Use correct field name: Microsoft.VSTS.TCM.ExpectedResults (with 's')
    if (data.expected !== undefined) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.ExpectedResults", value: data.expected || "" });
    }

    // Test Type (Positive/Negative)
    if (data.testType !== undefined) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Type", value: data.testType });
    }

    // Preconditions (using Repro Steps)
    if (data.preconditions !== undefined) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.ReproSteps", value: data.preconditions || "" });
    }

    if (patch.length === 0) {
        throw new Error("No fields to update");
    }

    const result = await witApi.updateWorkItem(
        null,
        patch,
        testCaseId,
        project
    );

    return result;
}

module.exports = {
    fetchProjects,
    fetchTestPlans,
    fetchSuites,
    createSuite,
    createTestCase,
    addTestCaseToSuite,
    fetchTestCasesFromSuite,
    updateTestCase
};
