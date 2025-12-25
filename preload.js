const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {


    fetchProjects: data => ipcRenderer.invoke("fetch-projects", data),
    fetchTestPlans: data => ipcRenderer.invoke("fetch-testplans", data),
    fetchSuites: data => ipcRenderer.invoke("fetch-suites", data),
    createSuite: data => ipcRenderer.invoke("create-suite", data),
    fetchTestCasesFromSuite: data => ipcRenderer.invoke("fetch-testcases-from-suite", data),

    openExcelDialog: () => ipcRenderer.invoke("open-excel-dialog"),
    saveExcelDialog: () => ipcRenderer.invoke("save-excel-dialog"),
    loadExcel: path => ipcRenderer.invoke("load-excel", path),
    exportExcel: data => ipcRenderer.invoke("export-excel", data),

    createTestCases: data => ipcRenderer.invoke("create-testcases", data),
    addTestCaseToSuite: data => ipcRenderer.invoke("add-testcase-to-suite", data),
    updateTestCase: data => ipcRenderer.invoke("update-testcase", data)
});
