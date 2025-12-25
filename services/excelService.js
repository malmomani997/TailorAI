const ExcelJS = require("exceljs");

async function loadExcel(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const headers = sheet.getRow(1).values;
    const idx = name => headers.indexOf(name);

    const getCellValue = (row, colName) => {
        const cell = row.getCell(idx(colName));
        if (!cell || cell.value === null || cell.value === undefined) {
            return "";
        }
        // Try text first, fallback to value converted to string
        return cell.text || String(cell.value || "");
    };

    return sheet
        .getRows(2, sheet.rowCount - 1)
        .filter(r => r && r.getCell(1).value)
        .map(row => ({
            title: getCellValue(row, "Title"),
            preconditions: getCellValue(row, "Preconditions"),
            expected: getCellValue(row, "Expected Result"),
            steps: getCellValue(row, "Steps")
        }));
}

async function exportExcel(filePath, testCases) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Test Cases");

    // Define columns
    sheet.columns = [
        { header: "ID", key: "id", width: 10 },
        { header: "Title", key: "title", width: 40 },
        { header: "State", key: "state", width: 15 },
        { header: "Assigned To", key: "assignedTo", width: 25 },
        { header: "Preconditions", key: "preconditions", width: 30 },
        { header: "Steps", key: "steps", width: 50 },
        { header: "Expected Result", key: "expected", width: 30 }
    ];

    // Add rows
    testCases.forEach(tc => {
        sheet.addRow({
            id: tc.id || "",
            title: tc.title || "",
            state: tc.state || "",
            assignedTo: tc.assignedTo || "",
            preconditions: tc.preconditions || "",
            steps: tc.steps || "", // This contains the clean text
            expected: tc.expected || ""
        });
    });

    // Style header
    sheet.getRow(1).font = { bold: true };

    // Enable wrapper text for cleaner viewing
    ['title', 'preconditions', 'steps', 'expected'].forEach(key => {
        sheet.getColumn(key).alignment = { wrapText: true, vertical: 'top' };
    });

    await workbook.xlsx.writeFile(filePath);
    return true;
}

module.exports = { loadExcel, exportExcel };
