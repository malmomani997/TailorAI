
import { consoleBox, orgInput, patInput } from './elements.js';

export function log(message, type = "info") {
    const colors = {
        info: "#111827",
        success: "#065f46",
        warning: "#92400e",
        error: "#7f1d1d"
    };

    const line = document.createElement("div");
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    line.style.color = colors[type] || colors.info;

    consoleBox.appendChild(line);
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

export function getPat() {
    return patInput.value.trim();
}

export function validateInputs() {
    const orgUrl = orgInput.value.trim();
    const pat = getPat();

    if (!orgUrl) {
        alert("Please enter Azure DevOps organization URL");
        return null;
    }
    if (!pat) {
        alert("Please enter your Personal Access Token (PAT)");
        return null;
    }
    return { orgUrl, pat };
}

export function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

export function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}
