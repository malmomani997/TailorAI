const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    fetchProjects: (payload) => ipcRenderer.invoke("fetch-projects", payload),
    updateTestCase: (payload) => ipcRenderer.invoke("update-testcase", payload),
    fetchProjectUsers: (payload) => ipcRenderer.invoke("fetch-project-users", payload),
    searchIdentities: (payload) => ipcRenderer.invoke("search-identities", payload),

    fetchTestPlans: data => ipcRenderer.invoke("fetch-testplans", data),
    fetchSuites: data => ipcRenderer.invoke("fetch-suites", data),
    fetchSuiteHierarchy: data => ipcRenderer.invoke("fetch-suite-hierarchy", data),
    onSuiteHierarchyProgress: (callback) => {
        ipcRenderer.on("suite-hierarchy-progress", (_, data) => callback(data));
    },
    createSuite: data => ipcRenderer.invoke("create-suite", data),
    fetchTestCasesFromSuite: data => ipcRenderer.invoke("fetch-testcases-from-suite", data),

    openExcelDialog: () => ipcRenderer.invoke("open-excel-dialog"),
    saveExcelDialog: () => ipcRenderer.invoke("save-excel-dialog"),
    loadExcel: path => ipcRenderer.invoke("load-excel", path),
    exportExcel: data => ipcRenderer.invoke("export-excel", data),

    createTestCases: data => ipcRenderer.invoke("create-testcases", data),
    addTestCaseToSuite: data => ipcRenderer.invoke("add-testcase-to-suite", data),
    updateTestCase: (payload) => ipcRenderer.invoke("update-testcase", payload)
});
