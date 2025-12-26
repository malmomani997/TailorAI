async function fetchSuiteHierarchyRecursive(orgUrl, project, planId, pat, onProgress) {
    console.log(`[Suites] Fetching hierarchy recursively for Plan ${planId}...`);

    const connection = getConnection(orgUrl, pat);
    const testApi = await connection.getTestPlanApi();

    try {
        // Get the plan to find the root suite
        const plan = await testApi.getPlanById(project, planId);

        if (!plan.rootSuite || !plan.rootSuite.id) {
            throw new Error("Plan has no root suite");
        }

        console.log(`[Suites] Building hierarchy from root: ${plan.rootSuite.id}`);

        // Track progress
        let fetchedCount = 0;

        // Recursively fetch a suite and all its descendants
        async function fetchSuiteAndChildren(suiteId) {
            const suite = await testApi.getTestSuiteById(project, planId, suiteId);
            fetchedCount++;

            // Report progress
            if (onProgress) {
                onProgress({
                    current: fetchedCount,
                    name: suite.name
                });
            }

            // If suite has children, fetch them recursively
            if (suite.suites && suite.suites.length > 0) {
                // Fetch all children in parallel for speed
                const childPromises = suite.suites.map(childRef =>
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
