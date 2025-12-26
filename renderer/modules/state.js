
export const state = {
    selectedProject: null,
    selectedPlanId: null,
    selectedSuiteId: null,
    projectUsers: [],
    cachedPlans: [], // Store plans for back navigation
    suiteHierarchyCache: new Map(), // key: `${project}-${planId}`
    transactionCache: new Map(), // For tracking ongoing fetches if needed
    testCases: [],
    // For tracking modifications
    // In the original code, `existingTestCases` was used but mainly `testCases` array was mutated.
    isEditingExisting: false
};
