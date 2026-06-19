document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;
    var errorEl = document.getElementById('login-error');
    
    if (!username || !password) {
        errorEl.textContent = t('login.required');
        errorEl.style.display = 'block';
        return;
    }
    
    try {
        var data = await login(username, password);
        if (data.must_change_password) {
            window.location.replace('/change-password');
        } else {
            window.location.replace('/');
        }
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
});