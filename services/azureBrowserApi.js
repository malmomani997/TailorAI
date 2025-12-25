export async function fetchProjects(orgUrl) {
    const res = await fetch(
        `${orgUrl}/_apis/projects?api-version=7.1`,
        {
            method: "GET",
            credentials: "include", // 🔥 THIS IS THE MAGIC
            headers: {
                "Accept": "application/json"
            }
        }
    );

    if (!res.ok) {
        throw new Error(`Failed to fetch projects: ${res.status}`);
    }

    const data = await res.json();

    if (Array.isArray(data.value)) {
        return data.value.map(p => p.name);
    }

    if (Array.isArray(data.projects)) {
        return data.projects.map(p => p.name);
    }

    return [];
}
