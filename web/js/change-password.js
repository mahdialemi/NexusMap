initCSRF();

(async function() {
    try {
        var u = await me();
        if (!u) { window.location.replace('/login'); return; }
        if (!u.must_change_password) { window.location.replace('/'); return; }
    } catch(e) { window.location.replace('/login'); }
})();

function checkStrength(pw) {
    var length = pw.length >= 12;
    var upper = /[A-Z]/.test(pw);
    var lower = /[a-z]/.test(pw);
    var digit = /\d/.test(pw);
    var special = /[^A-Za-z0-9]/.test(pw);

    document.getElementById('req-length').className = 'pw-req' + (length ? ' met' : '');
    document.getElementById('req-upper').className = 'pw-req' + (upper ? ' met' : '');
    document.getElementById('req-lower').className = 'pw-req' + (lower ? ' met' : '');
    document.getElementById('req-digit').className = 'pw-req' + (digit ? ' met' : '');
    document.getElementById('req-special').className = 'pw-req' + (special ? ' met' : '');

    var met = [length, upper, lower, digit, special].filter(Boolean).length;
    var pct = (met / 5) * 100;
    var fill = document.getElementById('pw-strength-fill');
    fill.style.width = pct + '%';
    if (pct <= 40) fill.style.background = 'var(--red)';
    else if (pct <= 60) fill.style.background = 'var(--orange)';
    else if (pct <= 80) fill.style.background = 'var(--yellow)';
    else fill.style.background = 'var(--green)';
}

document.getElementById('new-password').addEventListener('input', function() {
    checkStrength(this.value);
});

document.getElementById('change-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var oldPass = document.getElementById('old-password').value;
    var newPass = document.getElementById('new-password').value;
    var confirm = document.getElementById('confirm-password').value;
    var errorEl = document.getElementById('error-msg');
    errorEl.style.display = 'none';

    if (newPass !== confirm) {
        errorEl.textContent = t('change_password.do_not_match');
        errorEl.style.display = 'block';
        return;
    }

    var length = newPass.length >= 12;
    var upper = /[A-Z]/.test(newPass);
    var lower = /[a-z]/.test(newPass);
    var digit = /\d/.test(newPass);
    var special = /[^A-Za-z0-9]/.test(newPass);
    if (!length || !upper || !lower || !digit || !special) {
        errorEl.textContent = t('change_password.complexity_required');
        errorEl.style.display = 'block';
        return;
    }

    try {
        await changePassword(oldPass, newPass, confirm);
        window.location.replace('/');
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
});