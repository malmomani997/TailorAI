const azdev = require("azure-devops-node-api");
const axios = require("axios");

console.log("!!! [V3] AZURE CLIENT LOADED [V3] !!!");

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

async function fetchProjectUsers(orgUrl, project, pat) {
    const connection = getConnection(orgUrl, pat);
    const coreApi = await connection.getCoreApi();

    // 1. Get the project details to find the default team
    const projectDetails = await coreApi.getProject(project);
    if (!projectDetails || !projectDetails.defaultTeam) {
        return [];
    }

    // 2. Get members of the default team
    const members = await coreApi.getTeamMembersWithExtendedProperties(
        project,
        projectDetails.defaultTeam.id
    );

    // 3. Map to simple structure
    return members.map(m => ({
        id: m.identity.id,
        displayName: m.identity.displayName,
        uniqueName: m.identity.uniqueName,
        imageUrl: m.identity.imageUrl
    }));
}

async function getCurrentUser(orgUrl, pat) {
    return null;
}

async function searchIdentities(orgUrl, project, pat, query) {
    // ---------------------------------------------------------
    // STRATEGY 1: Identity Picker (Private API - Modern UI)
    // ---------------------------------------------------------
    try {
        console.log(`[Search] Strategy 1: Identity Picker for "${query}"`);
        const searchUrl = `${orgUrl}/_apis/IdentityPicker/Identities?api-version=5.1-preview.1`;
        const auth = Buffer.from(`:${pat}`).toString('base64');

        // Helpher to run payload
        const runPicker = async (scopes) => {
            return await axios.post(searchUrl, {
                "query": query,
                "identityTypes": ["user", "group"],
                "operationScopes": scopes,
                "options": { "MinResults": 5, "MaxResults": 40 }
            }, {
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
                validateStatus: status => status < 500
            });
        };

        // Try FULL scopes first
        let res = await runPicker(["ims", "source", "aad"]);

        // If 500, retry with SIMPLE scope (IMS only) - often fixes "Internal Server Error"
        if (res.status >= 500) {
            console.log(`[Search] Strategy 1 (Full) failed with ${res.status}. Retrying with SIMPLE scope (IMS only)...`);
            res = await runPicker(["ims"]);
        }

        if (res.status === 200 && res.data?.results?.[0]?.identities) {
            const users = res.data.results[0].identities.map(i => ({
                id: i.entityId,
                displayName: i.displayName,
                uniqueName: i.signInAddress || i.mail || i.samAccountName || "",
                imageUrl: i.image
            }));
            if (users.length > 0) {
                console.log(`[Search] Strategy 1 Success: Found ${users.length} users`);
                return users;
            }
        }
        console.log(`[Search] Strategy 1 returned no useful data. Status: ${res.status}`);
    } catch (err) {
        console.error(`[Search] Strategy 1 Failed (Skipping): ${err.message}`);
    }

    // ---------------------------------------------------------
    // STRATEGY 2: Graph API Subject Query (Public - Modern)
    // ---------------------------------------------------------
    try {
        console.log(`[Search] Strategy 2: Graph Subject Query for "${query}"`);

        // Helper to try Graph Query
        const runGraphQuery = async (baseUrl) => {
            const graphUrl = `${baseUrl}/_apis/graph/subjectquery?api-version=6.0-preview.1`;
            const auth = Buffer.from(`:${pat}`).toString('base64');
            return await axios.post(graphUrl, {
                "query": query,
                "subjectKind": ["User"]
            }, {
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
            });
        };

        let res;
        try {
            res = await runGraphQuery(orgUrl);
        } catch (err) {
            // Fallback to Server Root on 404/401
            if (err.response && (err.response.status === 404 || err.response.status === 401)) {
                // console.log("[Search] Strategy 2: Collection level failed. Trying Server Root...");
                const urlParts = orgUrl.split('/');
                if (urlParts.length > 3) {
                    urlParts.pop();
                    res = await runGraphQuery(urlParts.join('/'));
                } else { throw err; }
            } else { throw err; }
        }

        if (res.data && res.data.value) {
            const users = res.data.value.map(u => ({
                id: u.originId || u.descriptor,
                displayName: u.displayName,
                uniqueName: u.mailAddress || u.principalName || "",
                imageUrl: u._links?.avatar?.href || ""
            }));
            if (users.length > 0) {
                console.log(`[Search] Strategy 2 Success: Found ${users.length} users`);
                return users;
            }
        }
    } catch (err) {
        // console.error(`[Search] Strategy 2 Failed (Skipping): ${err.message}`);
    }

    // ---------------------------------------------------------
    // STRATEGY 3: IMS Identities (Legacy - Robust On-Prem)
    // ---------------------------------------------------------
    try {
        console.log(`[Search] Strategy 3: IMS Identities (Legacy) for "${query}"`);

        // /_apis/identities?searchFilter=General&filterValue={name}&api-version=5.0
        const imsUrl = `${orgUrl}/_apis/identities`;
        const auth = Buffer.from(`:${pat}`).toString('base64');

        const res = await axios.get(imsUrl, {
            params: {
                "searchFilter": "General",
                "filterValue": query,
                "queryMembership": "None",
                "api-version": "5.0"
            },
            headers: { 'Authorization': `Basic ${auth}` }
        });

        if (res.data && res.data.value) {
            const users = res.data.value
                .filter(u => !u.isContainer) // Filter out groups/containers
                .map(u => ({
                    id: u.id,
                    displayName: u.providerDisplayName || u.customDisplayName || u.displayName,
                    uniqueName: u.properties?.["Account"]?.["$value"] || u.properties?.["Mail"]?.["$value"] || "",
                    imageUrl: "" // IMS doesn't usually give image URL directly
                }));

            console.log(`[Search] Strategy 3 Success: Found ${users.length} users`);
            return users;
        }

    } catch (err) {
        // console.error(`[Search] Strategy 3 Failed: ${err.message}`);
    }

    // ---------------------------------------------------------
    // STRATEGY 4: User Entitlements (The "List Everyone" Approach)
    // ---------------------------------------------------------
    try {
        console.log(`[Search] Strategy 4: User Entitlements (Listing top matches)`);

        const runEntitlements = async (baseUrl) => {
            const entUrl = `${baseUrl}/_apis/userentitlements?top=1000&api-version=5.0-preview.2`;
            const auth = Buffer.from(`:${pat}`).toString('base64');
            return await axios.get(entUrl, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
        };

        let res;
        try {
            res = await runEntitlements(orgUrl);
        } catch (err) {
            // Fallback to Server Root
            if (orgUrl.split('/').length > 3) {
                console.log("[Search] Strategy 4: Collection level failed. Trying Server Root...");
                const urlParts = orgUrl.split('/');
                urlParts.pop();
                res = await runEntitlements(urlParts.join('/'));
            } else { throw err; }
        }

        if (res.data && res.data.items) {
            const users = res.data.items
                .map(i => i.user)
                .filter(u => u.displayName.toLowerCase().includes(query.toLowerCase()) ||
                    u.mailAddress?.toLowerCase().includes(query.toLowerCase()) ||
                    u.principalName?.toLowerCase().includes(query.toLowerCase()))
                .map(u => ({
                    id: u.id,
                    displayName: u.displayName,
                    uniqueName: u.mailAddress || u.principalName || "",
                    imageUrl: ""
                }));

            if (users.length > 0) {
                console.log(`[Search] Strategy 4 Success: Found ${users.length} users`);
                return users;
            }
        }
    } catch (err) {
        console.error(`[Search] Strategy 4 Failed: ${err.message}`);
    }

    // ---------------------------------------------------------
    // STRATEGY 5: Graph Users (The "Nuclear" Option)
    // ---------------------------------------------------------
    try {
        console.log(`[Search] Strategy 5: Graph Users List (The Nuclear Option)`);

        const runGraphList = async (baseUrl) => {
            // subjectTypes=p (People/Users)
            // We use a large top to get as many as possible
            const graphUrl = `${baseUrl}/_apis/graph/users?subjectTypes=p&api-version=6.0-preview.1`;
            const auth = Buffer.from(`:${pat}`).toString('base64');
            return await axios.get(graphUrl, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
        };

        let res;
        try {
            res = await runGraphList(orgUrl);
        } catch (err) {
            if (orgUrl.split('/').length > 3) {
                console.log("[Search] Strategy 5: Collection level failed. Trying Server Root...");
                const urlParts = orgUrl.split('/');
                urlParts.pop();
                res = await runGraphList(urlParts.join('/'));
            } else { throw err; }
        }

        if (res.data && res.data.value) {
            const users = res.data.value
                .filter(u => u.displayName?.toLowerCase().includes(query.toLowerCase()) ||
                    u.mailAddress?.toLowerCase().includes(query.toLowerCase()) ||
                    u.principalName?.toLowerCase().includes(query.toLowerCase()))
                .map(u => ({
                    id: u.originId || u.descriptor,
                    displayName: u.displayName,
                    uniqueName: u.mailAddress || u.principalName || "",
                    imageUrl: u._links?.avatar?.href || ""
                }));

            if (users.length > 0) {
                console.log(`[Search] Strategy 5 Success: Found ${users.length} users`);
                return users;
            }
        }

    } catch (err) {
        console.error(`[Search] Strategy 5 Failed: ${err.message}`);
    }

    console.log("[Search] All 5 Strategies Failed to find a match.");
    return [];

    try {
        console.log(`[Search] Strategy 4: User Entitlements (Listing top matches)`);
        // Note: This API lists users in the organization. 
        // We filter manually since the API sorting/filtering is limited on older versions.

        // Remove collection from URL if possible, strict server level? 
        // Actually usually works at collection level for on-prem.
        const entUrl = `${orgUrl}/_apis/userentitlements?top=200&api-version=5.0-preview.2`;
        const auth = Buffer.from(`:${pat}`).toString('base64');

        const res = await axios.get(entUrl, {
            headers: { 'Authorization': `Basic ${auth}` }
        });

        if (res.data && res.data.items) {
            const users = res.data.items
                .map(i => i.user)
                .filter(u => u.displayName.toLowerCase().includes(query.toLowerCase()) ||
                    u.mailAddress?.toLowerCase().includes(query.toLowerCase()))
                .map(u => ({
                    id: u.id,
                    displayName: u.displayName,
                    uniqueName: u.mailAddress || u.principalName || "",
                    imageUrl: ""
                }));

            if (users.length > 0) {
                console.log(`[Search] Strategy 4 Success: Found ${users.length} users`);
                return users;
            }
        }
    } catch (err) {
        console.error(`[Search] Strategy 4 Failed: ${err.message}`);
    }

    return [];
}

/* ================= TEST PLANS ================= */

async function fetchTestPlans(orgUrl, project, pat) {
    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestPlanApi();
    return await testApi.getTestPlans(project);
}

/* ================= SUITES ================= */

async function fetchSuites(orgUrl, project, planId, pat) {
    // Strategy: Use 'asTreeView=true' to get the correct hierarchy and order directly from Azure
    console.log(`[Suites] Fetching suites for Plan ${planId} via REST API (asTreeView)...`);
    // 'asTreeView=true' returns the nested structure
    const linkUrl = `${orgUrl}/${project}/_apis/test/plans/${planId}/suites?asTreeView=true&api-version=5.0`;
    const auth = Buffer.from(`:${pat}`).toString('base64');

    try {
        const res = await axios.get(linkUrl, {
            headers: { 'Authorization': `Basic ${auth}` }
        });

        if (res.data && res.data.value) {
            const suites = res.data.value;
            console.log(`[Suites] Found ${suites.length} suites via REST.`);

            // DEBUG: Verification
            if (suites.length > 0) {
                const root = suites[0]; // Usually the root suite in expand=true response
                console.log("[DEBUG] Root Suite:", root.name, `(ID: ${root.id})`);

                if (root.suites) {
                    console.log("[DEBUG] Root Children (API Order):", JSON.stringify(root.suites.map(s => ({ id: s.id, name: s.name })), null, 2));
                } else {
                    console.log("[DEBUG] Root has no 'suites' property.");
                }

                const ids = new Set(suites.map(s => s.id));
                let orphaned = 0;
                let hasParent = 0;

                suites.forEach(s => {
                    if (s.parentSuite) {
                        hasParent++;
                        const pId = s.parentSuite.id ? Number(s.parentSuite.id) : Number(s.parentSuite);
                        if (!ids.has(pId)) orphaned++;
                    }
                });
                console.log(`[DEBUG] Integrity Check: ${hasParent} suites have parents. ${orphaned} are orphaned (parent not in list).`);
            }

            return suites;
        }
    } catch (err) {
        console.error(`[Suites] REST fetch failed: ${err.message}. Falling back to SDK.`);
    }

    // Fallback if REST fails
    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestPlanApi();
    return await testApi.getTestSuitesForPlan(project, planId, true);
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
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.ReproSteps", value: data.preconditions });
    }

    if (data.expected) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.ExpectedResults", value: data.expected });
    }

    if (data.assignedTo) {
        patch.push({ op: "add", path: "/fields/System.AssignedTo", value: data.assignedTo });
    }

    // Add Test Type (Positive/Negative)
    if (data.testType) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Type", value: data.testType });
    }

    // User Story Linking Removed per request
    // if (userStoryId) { ... }

    const result = await witApi.createWorkItem(
        null,
        patch,
        project,
        "Test Case"
    );

    return result.id;
}

async function addTestCaseToSuite(orgUrl, project, planId, suiteId, testCaseId, pat) {
    // ---------------------------------------------------------
    // LINKING STRATEGY: Legacy API (Axios)
    // The SDK's TestPlanApi often fails on older On-Prem servers.
    // We use the robust _apis/test/plans/{planId}/suites/{suiteId}/testcases/{id} endpoint.
    // ---------------------------------------------------------
    try {
        console.log(`[Link] Adding TestCase ${testCaseId} to Suite ${suiteId} (Legacy API)...`);

        // Ensure URLs are clean? explicit mapping
        // POST https://{instance}/{collection}/{project}/_apis/test/plans/{planId}/suites/{suiteId}/testcases/{testCaseIds}?api-version=5.0
        const linkUrl = `${orgUrl}/${project}/_apis/test/plans/${planId}/suites/${suiteId}/testcases/${testCaseId}?api-version=5.0`;
        const auth = Buffer.from(`:${pat}`).toString('base64');

        const res = await axios.post(linkUrl, {}, {
            headers: { 'Authorization': `Basic ${auth}` }
        });

        console.log(`[Link] Success. Status: ${res.status}`);
    } catch (err) {
        console.error(`[Link] Failed to link TC ${testCaseId} to Suite ${suiteId}: ${err.message}`);

        // Optional: Retry with older api-version if 5.0 fails?
        // Usually 5.0 is safe for 2019+.
        throw err;
    }
}

async function fetchTestCasesFromSuite(orgUrl, project, planId, suiteId, pat) {
    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestApi();
    const witApi = await connection.getWorkItemTrackingApi();

    const testPoints = await testApi.getPoints(
        project,
        planId,
        suiteId
    );

    console.log(`Found ${testPoints?.length || 0} test points`);
    if (!testPoints || testPoints.length === 0) return [];

    const workItemIds = testPoints
        .map(p => p?.testCase?.id)
        .filter(Boolean)
        .map(id => Number(id))
        .filter(Number.isFinite);

    console.log("Extracted work item IDs:", workItemIds);
    if (workItemIds.length === 0) return [];

    const workItems = [];
    const chunkSize = 200;

    for (let i = 0; i < workItemIds.length; i += chunkSize) {
        const chunk = workItemIds.slice(i, i + chunkSize);
        try {
            const batch = await witApi.getWorkItems(
                chunk,
                undefined,
                undefined,
                undefined
            );
            workItems.push(...batch);
        } catch (err) {
            console.error(`Error fetching batch ${i} to ${i + chunkSize}:`, err);
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
        preconditions: wi.fields?.["Microsoft.VSTS.TCM.ReproSteps"] || "",
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

    if (data.title !== undefined) {
        patch.push({ op: "add", path: "/fields/System.Title", value: data.title });
    }

    if (data.steps !== undefined) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.Steps", value: data.steps || "" });
    }

    if (data.expected !== undefined) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.ExpectedResults", value: data.expected || "" });
    }

    if (data.testType !== undefined) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Type", value: data.testType });
    }

    if (data.preconditions !== undefined) {
        patch.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.ReproSteps", value: data.preconditions || "" });
    }

    if (data.assignedTo !== undefined) {
        patch.push({ op: "add", path: "/fields/System.AssignedTo", value: data.assignedTo || "" });
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

/* ================= RECURSIVE SUITE HIERARCHY ================= */

async function fetchSuiteHierarchyRecursive(orgUrl, project, planId, pat, onProgress) {
    console.log(`[Suites] Fetching hierarchy recursively for Plan ${planId}...`);

    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestPlanApi();

    try {
        // Get the plan to find the root suite
        const plan = await testApi.getTestPlanById(project, planId);

        if (!plan.rootSuite || !plan.rootSuite.id) {
            throw new Error("Plan has no root suite");
        }

        console.log(`[Suites] Building hierarchy from root: ${plan.rootSuite.id}`);

        // Track progress
        let fetchedCount = 0;

        // Recursively fetch a suite and all its descendants
        async function fetchSuiteAndChildren(suiteId) {
            // Expand = 1 (Children)
            const suite = await testApi.getTestSuiteById(project, planId, suiteId, 1);
            fetchedCount++;

            // Report progress
            if (onProgress) {
                onProgress({
                    current: fetchedCount,
                    name: suite.name
                });
            }

            console.log(`[DEBUG] Suite "${suite.name}" (ID: ${suite.id}) Keys:`, Object.keys(suite).join(", "));
            if (suite.suites) console.log(`[DEBUG] suite.suites length: ${suite.suites.length}`);
            if (suite.children) console.log(`[DEBUG] suite.children length: ${suite.children.length}`);

            // If suite has children, fetch them recursively
            // The SDK logic varies - checking both "children" and "suites"
            const potentialChildren = suite.children || suite.suites;

            if (potentialChildren && potentialChildren.length > 0) {
                // Fetch all children in parallel for speed
                const childPromises = potentialChildren.map(childRef =>
                    fetchSuiteAndChildren(childRef.id)
                );
                suite.children = await Promise.all(childPromises);
            } else {
                suite.children = [];
            }

            return suite;
        }

        // Fetch the entire tree starting from root
        const rootSuite = await fetchSuiteAndChildren(plan.rootSuite.id);

        console.log(`[Suites] Successfully fetched ${fetchedCount} suites recursively`);

        return rootSuite;

    } catch (err) {
        console.error(`[Suites] Recursive fetch failed: ${err.message}`);
        throw err;
    }
}

module.exports = {
    fetchProjects,
    fetchTestPlans,
    fetchSuites,
    fetchSuiteHierarchyRecursive,
    createSuite,
    createTestCase,
    addTestCaseToSuite,
    fetchTestCasesFromSuite,
    updateTestCase,
    fetchProjectUsers,
    getCurrentUser,
    searchIdentities
};
