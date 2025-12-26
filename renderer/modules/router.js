
// ===============================
// ROUTER LOGIC
// ===============================

export function initRouter() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const pageTitle = document.getElementById('page-title');

    function navigateTo(viewId, title) {
        // 1. Update Views
        views.forEach(view => {
            if (view.id === viewId) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        // 2. Update Nav State
        navItems.forEach(item => {
            if (item.dataset.view === viewId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // 3. Update Title
        if (pageTitle) {
            pageTitle.textContent = title;
        }
    }

    // Bind Click Events
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.dataset.view;
            const title = item.querySelector('span:last-child').textContent;
            navigateTo(viewId, title);
        });
    });

    // Sidebar Toggle
    const sidebar = document.getElementById('appSidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    if (sidebar && toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}
