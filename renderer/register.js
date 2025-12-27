// IPC Not needed for Auth


document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const role = document.getElementById('role').value;
    const password = document.getElementById('password').value;
    const orgUrl = document.getElementById('orgUrl').value;
    const pat = document.getElementById('pat').value;

    try {
        const response = await fetch('http://localhost:3000/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role, orgUrl, pat })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Registration successful! Please login.');
            window.location.href = 'login.html';
        } else {
            alert('Registration failed: ' + data.error);
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('Failed to connect to server.');
    }
});
