
import { consoleBox, orgInput, patInput } from './elements.js';

// Toast Helper
export function log(message, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon Selection
    let icon = "ℹ️";
    if (type === 'success') icon = "✅";
    if (type === 'error') icon = "❌";
    if (type === 'warning') icon = "⚠️";

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
            <div>${message}</div>
        </div>
    `;

    container.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
        toast.classList.add('fadeOut');
        toast.addEventListener('animationend', () => {
            if (toast.parentElement) toast.remove();
        });
    }, 4000);
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
