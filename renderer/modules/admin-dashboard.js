
import { apiClient } from './apiClient.js';

const usersList = document.getElementById('usersList');
const orgNameDisplay = document.getElementById('orgName');
const logoutBtn = document.getElementById('logoutBtn');
const inviteBtn = document.getElementById('inviteUserBtn');
const inviteModal = document.getElementById('inviteModal');
const confirmInvite = document.getElementById('confirmInvite');
const cancelInvite = document.getElementById('cancelInvite');
const inviteUsername = document.getElementById('inviteUsername');
const invitePassword = document.getElementById('invitePassword');
const inviteRole = document.getElementById('inviteRole');

let currentUser = null;

async function init() {
    const userJson = localStorage.getItem('user');
    if (!userJson) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = JSON.parse(userJson);

    // Security check (frontend only)
    if (currentUser.role !== 'Admin') {
        alert("Access Denied. Admins only.");
        window.location.href = 'index.html';
        return;
    }

    orgNameDisplay.textContent = `Organization: ${currentUser.orgUrl}`;

    logoutBtn.onclick = () => {
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    };

    inviteBtn.onclick = () => inviteModal.style.display = 'flex';
    cancelInvite.onclick = () => inviteModal.style.display = 'none';
    confirmInvite.onclick = createUser;

    await loadUsers();
}

async function loadUsers() {
    usersList.innerHTML = '<div style="text-align:center; color:var(--text-muted)">Loading...</div>';

    try {
        // Fetch ALL users in this Org
        const users = await apiClient.getUsers(null, currentUser.orgUrl);
        renderUsers(users);
    } catch (e) {
        usersList.innerHTML = `<div style="color:var(--status-failed)">Failed to load users: ${e.message}</div>`;
    }
}

function renderUsers(users) {
    if (!users || users.length === 0) {
        usersList.innerHTML = '<div style="text-align:center;">No users found.</div>';
        return;
    }

    usersList.innerHTML = users.map(user => {
        const isSelf = user.id === currentUser.id;
        // Don't allow editing self or other Admins (permissions wise) to avoid lockout, simplistic for now
        const canEdit = true;

        return `
        <div class="user-card">
            <div class="user-info">
                <h4>${user.username} <span class="role-badge">${user.role}</span></h4>
                <p>ID: ${user.id} | can_push_direct: <strong>${!!user.can_push_direct}</strong></p>
            </div>
            <div class="permissions-controls">
                
                <!-- Toggle Direct Push -->
                <label style="font-size:12px; display:flex; align-items:center; gap:4px; cursor:pointer;">
                    <input type="checkbox" 
                        ${user.can_push_direct ? 'checked' : ''} 
                        onchange="updateUser(${user.id}, 'canPushDirect', this.checked)"
                        ${isSelf ? 'disabled' : ''}
                    >
                    Direct Push
                </label>

                <!-- Change Role (Simple dropdown) -->
                <select style="font-size:12px; padding:2px;" 
                    onchange="updateUser(${user.id}, 'role', this.value)"
                    ${isSelf ? 'disabled' : ''}
                >
                    <option value="Tester" ${user.role === 'Tester' ? 'selected' : ''}>Tester</option>
                    <option value="Lead" ${user.role === 'Lead' ? 'selected' : ''}>Lead</option>
                    <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                </select>

                <!-- Reset Password -->
                 <button class="secondary" style="font-size:11px; padding:4px 8px;" onclick="resetPassword(${user.id}, '${user.username}')">
                    Reset PWD
                </button>
            </div>
        </div>
        `;
    }).join("");
}

window.updateUser = async (id, field, value) => {
    try {
        const payload = {};
        if (field === 'role') payload.role = value;
        if (field === 'canPushDirect') payload.canPushDirect = value;

        // ApiClient needs an update method or use fetch directly
        // Currently apiClient.js doesn't have update user, so we add check or use fetch
        const response = await fetch(`http://localhost:3000/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Update failed");

        // Reload to confirm state
        await loadUsers();
    } catch (e) {
        alert(e.message);
        await loadUsers(); // Revert UI
    }
};

window.resetPassword = async (id, name) => {
    const newPass = prompt(`Enter new password for ${name}:`);
    if (!newPass) return;

    try {
        const response = await fetch(`http://localhost:3000/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPass })
        });
        if (!response.ok) throw new Error("Reset failed");
        alert("Password updated.");
    } catch (e) {
        alert(e.message);
    }
};

async function createUser() {
    const username = inviteUsername.value;
    const password = invitePassword.value;
    const role = inviteRole.value;

    if (!username || !password) return alert("Missing fields");

    try {
        await apiClient.register({
            username,
            password,
            role,
            orgUrl: currentUser.orgUrl,
            pat: "placeholder" // Admins might not set PATs for others, or we leave it empty
        });

        inviteModal.style.display = 'none';
        inviteUsername.value = '';
        invitePassword.value = '';
        await loadUsers();
    } catch (e) {
        alert(e.message);
    }
}

init();
