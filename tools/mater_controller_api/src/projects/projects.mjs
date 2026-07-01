// projects/projects.mjs
// Project registry for the API. Mini Audit is the first (and only) active module.
// Other projects are NOT faked with data.
export function listProjects() {
    return [
        { id: 'mini_audit', name: 'Mini Audit', status: 'active', enabled: true },
    ];
}

export function getProject(id) {
    return listProjects().find((p) => p.id === id) || null;
}
