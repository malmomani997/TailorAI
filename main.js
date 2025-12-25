const { app, BrowserWindow, ipcMain, dialog, session } = require("electron");
const path = require("path");

const { loadExcel } = require("./services/excelService");
const {
    fetchProjects,
    fetchTestPlans,
    fetchSuites,
    createSuite,
    createTestCase,
    addTestCaseToSuite,
    fetchTestCasesFromSuite,
    updateTestCase
} = require("./services/azureClient");

let mainWindow;

/* =====================================================
 * MAIN WINDOW
 * ===================================================== */
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Tailor AI",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
}

/* =====================================================
 * APP LIFECYCLE
 * ===================================================== */
app.whenReady().then(() => {
    createMainWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});



/* =====================================================
 * FILE DIALOGS
 * ===================================================== */
ipcMain.handle("open-excel-dialog", async () => {
    const result = await dialog.showOpenDialog({
        filters: [{ name: "Excel", extensions: ["xlsx"] }],
        properties: ["openFile"]
    });
    return result.canceled ? null : result.filePaths[0];
});

/* =====================================================
 * EXCEL
 * ===================================================== */
ipcMain.handle("load-excel", async (_, filePath) => {
    if (!filePath) throw new Error("File path is required");
    return await loadExcel(filePath);
});

ipcMain.handle("save-excel-dialog", async () => {
    const result = await dialog.showSaveDialog({
        title: "Export Test Cases",
        defaultPath: "TestCases.xlsx",
        filters: [{ name: "Excel", extensions: ["xlsx"] }]
    });
    return result.canceled ? null : result.filePath;
});

ipcMain.handle("export-excel", async (_, { filePath, testCases }) => {
    const { exportExcel } = require("./services/excelService");
    if (!filePath) throw new Error("FilePath is required");
    return await exportExcel(filePath, testCases);
});

/* =====================================================
 * AZURE DEVOPS – READ
 * ===================================================== */
ipcMain.handle("fetch-projects", async (_, { orgUrl, pat }) => {
    if (!pat) throw new Error("PAT is required");
    return await fetchProjects(orgUrl, pat);
});

ipcMain.handle("fetch-testplans", async (_, { orgUrl, project, pat }) => {
    if (!pat) throw new Error("PAT is required");
    return await fetchTestPlans(orgUrl, project, pat);
});

ipcMain.handle("fetch-suites", async (_, { orgUrl, project, planId, pat }) => {
    if (!pat) throw new Error("PAT is required");
    return await fetchSuites(orgUrl, project, planId, pat);
});

/* =====================================================
 * AZURE DEVOPS – WRITE
 * ===================================================== */
ipcMain.handle("create-suite", async (_, payload) => {
    const { orgUrl, project, planId, suiteName, pat } = payload;
    if (!pat) throw new Error("PAT is required");
    return await createSuite(orgUrl, project, planId, suiteName, pat);
});

/* =====================================================
 * TEST CASES
 * ===================================================== */
ipcMain.handle("create-testcases", async (_, payload) => {
    const { orgUrl, project, testCases, userStoryId, pat } = payload;
    if (!pat) throw new Error("PAT is required");

    const created = [];

    for (const tc of testCases) {
        try {
            const id = await createTestCase({
                orgUrl,
                project,
                pat,
                userStoryId,
                data: {
                    title: tc.title,
                    steps: tc.steps || "",
                    preconditions: tc.preconditions || "",
                    expected: tc.expected || ""
                }
            });

            created.push({ id, title: tc.title, success: true });
        } catch (err) {
            console.error(`Failed to create test case: ${tc.title}`, err);
            created.push({ title: tc.title, success: false, error: err.message });
        }
    }

    return created;
});

ipcMain.handle("add-testcase-to-suite", async (_, payload) => {
    const { orgUrl, project, planId, suiteId, testCaseIds, pat } = payload;
    if (!pat) throw new Error("PAT is required");

    for (const id of testCaseIds) {
        await addTestCaseToSuite(orgUrl, project, planId, suiteId, id, pat);
    }

    return { success: true, count: testCaseIds.length };
});

ipcMain.handle("fetch-testcases-from-suite", async (_, payload) => {
    const { orgUrl, project, planId, suiteId, pat } = payload;
    if (!pat) throw new Error("PAT is required");

    try {
        const cases = await fetchTestCasesFromSuite(
            orgUrl,
            project,
            planId,
            suiteId,
            pat
        );
        return cases;
    } catch (err) {
        console.error("[IPC] fetch-testcases-from-suite failed", err);
        throw err;
    }
});

ipcMain.handle("update-testcase", async (_, payload) => {
    const { orgUrl, project, pat, testCaseId, data } = payload;
    if (!pat) throw new Error("PAT is required");

    return await updateTestCase({
        orgUrl,
        project,
        pat,
        testCaseId,
        data
    });
});

/* =====================================================
 * GLOBAL SAFETY NET (CRITICAL FOR ELECTRON)
 * ===================================================== */
process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
});
