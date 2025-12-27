// IPC Not needed for Auth


document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('http://localhost:3000/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.status === 300) {
            // Multiple Orgs Found
            showOrgModal(data.choices);
            return;
        }

        if (response.ok) {
            handleLoginSuccess(data);
        } else {
            alert('Login failed: ' + data.error);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Failed to connect to server. Is it running?');
    }
});

function handleLoginSuccess(user) {
    localStorage.setItem('user', JSON.stringify(user));
    if (user.role === 'Admin') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'index.html';
    }
}

function showOrgModal(choices) {
    const modal = document.getElementById('orgModal');
    const list = document.getElementById('orgList');
    const cancelBtn = document.getElementById('cancelOrg');

    modal.style.display = 'flex';
    list.innerHTML = '';

    choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.innerHTML = `<strong>${choice.orgUrl}</strong> <span style="font-size:11px;opacity:0.8">(${choice.role})</span>`;
        btn.style.textAlign = 'left';
        btn.onclick = () => selectOrg(choice.id);
        list.appendChild(btn);
    });

    cancelBtn.onclick = () => modal.style.display = 'none';
}

async function selectOrg(userId) {
    try {
        const response = await fetch('http://localhost:3000/auth/select-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        const user = await response.json();
        if (response.ok) {
            handleLoginSuccess(user);
        } else {
            alert(user.error);
        }
    } catch (e) {
        alert(e.message);
    }
}
