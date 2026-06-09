document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var username = document.getElementById('username').value;
    var password = document.getElementById('password').value;
    var errorEl = document.getElementById('login-error');
    
    try {
        var data = await login(username, password);
        if (data.must_change_password) {
            window.location.href = '/change-password';
        } else {
            window.location.href = '/';
        }
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
});