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
