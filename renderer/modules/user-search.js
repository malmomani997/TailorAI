
import { state } from './state.js';
import { log, validateInputs, escapeHtml } from './ui-helpers.js';
import { renderTestCaseTable } from './table.js';

let searchTimeout = null;
let activeRowIndex = null;
let globalDropdown = null;

// Initialize global dropdown
export function initGlobalDropdown() {
    if (globalDropdown) return;
    globalDropdown = document.createElement("div");
    globalDropdown.className = "user-dropdown-list";
    globalDropdown.style.position = "fixed";
    globalDropdown.style.maxHeight = "300px";
    document.body.appendChild(globalDropdown);
    log("Global user dropdown initialized", "info");
}

export async function handleUserSearch(query, index) {
    if (!globalDropdown) initGlobalDropdown();

    activeRowIndex = index;
    const input = document.getElementById(`assign-input-${index}`);
    if (!input) return;

    // Position the dropdown
    const rect = input.getBoundingClientRect();
    globalDropdown.style.top = (rect.bottom + 2) + "px";
    globalDropdown.style.left = rect.left + "px";
    globalDropdown.style.width = rect.width + "px";

    // Show loading or local filter first
    if (!query) {
        renderUserList(state.projectUsers.slice(0, 10));
        return;
    }

    // 1. Filter local users
    const localMatches = state.projectUsers.filter(u =>
        u.displayName.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10);

    renderUserList(localMatches, true /* isSearching */);

    if (query.length < 3) return;

    // 2. Debounced Remote Search
    if (searchTimeout) clearTimeout(searchTimeout);

    searchTimeout = setTimeout(async () => {
        try {
            log(`Searching directory for "${query}"...`);
            const inputs = validateInputs();
            const remoteMatches = await window.api.searchIdentities({
                ...inputs,
                project: state.selectedProject,
                query
            });

            const combined = [...localMatches];
            remoteMatches.forEach(rm => {
                if (!combined.find(c => c.displayName === rm.displayName)) {
                    combined.push(rm);
                }
            });

            renderUserList(combined, false);

        } catch (err) {
            console.error(err);
        }
    }, 400);
}

function renderUserList(users, isSearching = false) {
    if (!globalDropdown) return;

    if (users.length === 0 && !isSearching) {
        globalDropdown.innerHTML = `<div class="user-item" style="color:#9ca3af;font-style:italic;">No users found</div>`;
        globalDropdown.classList.add("active");
        return;
    }

    globalDropdown.innerHTML = users.map(u => `
        <div class="user-item" onmousedown="window.selectUser('${escapeHtml(u.displayName)}', '${escapeHtml(u.uniqueName || "")}')">
            <span class="name">${escapeHtml(u.displayName)}</span>
            ${u.uniqueName ? `<span class="email">${escapeHtml(u.uniqueName)}</span>` : ''}
        </div>
    `).join("");

    if (isSearching) {
        globalDropdown.innerHTML += `<div class="user-item" style="color:#6b7280;font-style:italic;font-size:11px;">Searching...</div>`;
    }

    globalDropdown.classList.add("active");
}

export function selectUser(displayName, uniqueName) {
    if (activeRowIndex === null) return;

    const i = activeRowIndex;

    // Update state
    state.testCases[i].assignedTo = displayName;
    state.testCases[i]._modified = true;

    // Cache user
    if (!state.projectUsers.find(u => u.displayName === displayName)) {
        state.projectUsers.push({ displayName, uniqueName });
    }

    // Update UI immediately (lightweight)
    const input = document.getElementById(`assign-input-${i}`);
    if (input) input.value = displayName;

    // Hide dropdown
    if (globalDropdown) globalDropdown.classList.remove("active");

    // Full render to ensure consistency
    renderTestCaseTable();
}

export function hideUserListDelayed() {
    // 200ms delay to allow click to register
    setTimeout(() => {
        if (globalDropdown) globalDropdown.classList.remove("active");
        activeRowIndex = null;
    }, 200);
}

// Bind to window for HTML event handlers
window.handleUserSearch = handleUserSearch;
window.selectUser = selectUser;
window.hideUserListDelayed = hideUserListDelayed;
