// REPLACEMENT FOR openModalForSuites function in renderer.js
// Find the function starting around line 383 and replace it with this:

async function openModalForSuites(plan) {
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
    window.api.onSuiteHierarchyProgress((progress) => {
        if (progressDiv) {
            progressDiv.textContent = `Fetched ${progress.current} suite(s)... (${progress.name})`;
        }
    });

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
