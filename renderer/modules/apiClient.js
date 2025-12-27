const API_BASE = 'http://localhost:3000';

export const apiClient = {
    async login(username, password) {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return response.json();
    },

    async register(userData) {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        return response.json();
    },

    async getUsers(role, orgUrl) {
        let url = `${API_BASE}/users`;
        const params = new URLSearchParams();
        if (role) params.append('role', role);
        if (orgUrl) params.append('orgUrl', orgUrl);

        const fullUrl = `${url}?${params.toString()}`;
        const response = await fetch(fullUrl);

        if (!response.ok) {
            const text = await response.text();
            console.error(`[API] getUsers failed: ${response.status} ${response.statusText}`, text);
            throw new Error(`Server Error (${response.status}): ${text.substring(0, 100)}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error(`[API] Invalid JSON from ${fullUrl}:`, text);
            throw new Error("Invalid format from server. Check console for details.");
        }
    },

    async createDraft(draftData) {
        const response = await fetch(`${API_BASE}/cases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draftData)
        });
        return response.json();
    },

    async getCases(filter = {}) {
        const query = new URLSearchParams(filter).toString();
        const response = await fetch(`${API_BASE}/cases?${query}`);
        return response.json();
    },

    async updateCaseStatus(id, status) {
        const response = await fetch(`${API_BASE}/cases/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        return response.json();
    }
};
