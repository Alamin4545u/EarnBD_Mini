// 1. CONFIGURATION
const SUPABASE_URL = 'https://wnmwvbeydsrehtsnkfoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubXd2YmV5ZHNyZWh0c25rZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDg4MzIsImV4cCI6MjA3OTg4NDgzMn0.4vSObxBEr8r11-dqkp9y6bVroMVoSTEnIOTF8Vo8sxk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let appSettings = {};
let adFuncs = { interstitial: null, rewarded: null, popup: null };
let authMode = 'login';
const DIRECT_LINK_WAIT_TIME = 10000; // 10 Sec Wait

// 2. INITIALIZATION
async function initApp() {
    try {
        // Fetch Settings (Admin Controls)
        const { data: sData } = await supabase.from('settings').select('*').single();
        appSettings = sData || {};

        // Load Monetag Scripts Dynamically from Settings
        if (appSettings.monetag_interstitial_id) loadScript(appSettings.monetag_interstitial_id, (n) => adFuncs.interstitial = n);
        if (appSettings.monetag_rewarded_id) loadScript(appSettings.monetag_rewarded_id, (n) => adFuncs.rewarded = n);
        if (appSettings.monetag_popup_id) loadScript(appSettings.monetag_popup_id, (n) => adFuncs.popup = n);

        // Check Login
        const storedUser = localStorage.getItem('user_id');
        if (storedUser) {
            await fetchUser(storedUser);
        } else {
            showAuth();
        }

        // Handle Referral Link
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        if (refCode) {
            toggleAuth('signup');
            document.getElementById('auth-ref').value = refCode;
        }

    } catch (err) {
        console.error(err);
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('error-box').classList.remove('hidden');
    }
}

// 3. AUTHENTICATION (Fixed NaN and Registration Error)
function showAuth() {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
}

function toggleAuth(mode) {
    authMode = mode;
    const loginTab = document.getElementById('tab-login');
    const signupTab = document.getElementById('tab-signup');
    const extraFields = document.getElementById('signup-fields');

    if (mode === 'login') {
        loginTab.className = "flex-1 py-2 rounded-md text-sm font-bold bg-[#FFD700] text-black";
        signupTab.className = "flex-1 py-2 rounded-md text-sm font-bold text-gray-400";
        extraFields.classList.add('hidden');
    } else {
        signupTab.className = "flex-1 py-2 rounded-md text-sm font-bold bg-[#FFD700] text-black";
        loginTab.className = "flex-1 py-2 rounded-md text-sm font-bold text-gray-400";
        extraFields.classList.remove('hidden');
    }
}

async function submitAuth() {
    const phoneInput = document.getElementById('auth-phone').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    
    if (!phoneInput || !pass) return Swal.fire('Error', 'Fill all fields', 'warning');
    if (phoneInput.length !== 11) return Swal.fire('Error', 'Phone must be 11 digits', 'warning');

    const phone = parseInt(phoneInput);
    Swal.showLoading();

    try {
        if (authMode === 'login') {
            const { data } = await supabase.from('users').select('*').eq('id', phone).eq('password', pass).single();
            Swal.close();
            if (data) {
                localStorage.setItem('user_id', data.id);
                await fetchUser(data.id);
            } else {
                Swal.fire('Error', 'Invalid Phone or Password', 'error');
            }
        } else {
            // Anti-Cheat: Device Lock
            if (appSettings.anti_cheat_enabled && localStorage.getItem('device_registered')) {
                Swal.close();
                return Swal.fire('Error', 'One account per device allowed!', 'error');
            }

            const name = document.getElementById('auth-name').value.trim();
            const refInput = document.getElementById('auth-ref').value.trim();
            
            if (!name) { Swal.close(); return Swal.fire('Error', 'Enter Name', 'warning'); }

            const refID = (refInput && !isNaN(refInput)) ? parseInt(refInput) : null;

            const { data: res } = await supabase.rpc('handle_new_user', {
                p_phone: phone, p_pass: pass, p_name: name, p_referrer: refID
            });

            Swal.close();
            if (res && res.success) {
                if (appSettings.anti_cheat_enabled) localStorage.setItem('device_registered', 'true');
                localStorage.setItem('user_id', phone);
                fetchUser(phone);
            } else {
                Swal.fire('Error', res?.message || 'Failed', 'error');
            }
        }
    } catch (e) {
        Swal.close();
        Swal.fire('Error', 'System error', 'error');
    }
}

async function fetchUser(uid) {
    const { data } = await supabase.from('users').select('*').eq('id', uid).single();
    if (data) {
        currentUser = data;
        updateUI();
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('app-header').classList.remove('hidden');
        document.getElementById('app-nav').classList.remove('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        router('home');
    } else {
        localStorage.removeItem('user_id');
        location.reload();
    }
}

// 4. HELPER: Load Scripts
function loadScript(zoneId, cb) {
    const s = document.createElement('script');
    s.src = '//libtl.com/sdk.js';
    const fname = 'show_' + zoneId;
    s.setAttribute('data-zone', zoneId);
    s.setAttribute('data-sdk', fname);
    s.onload = () => cb(fname);
    document.head.appendChild(s);
}

// 5. UI ROUTING
function updateUI() {
    document.getElementById('user-name').innerText = currentUser.first_name;
    document.getElementById('user-balance').innerText = Math.floor(currentUser.balance);
    document.getElementById('user-photo').src = `https://ui-avatars.com/api/?name=${currentUser.first_name}&background=random`;
}

function router(page) {
    document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.remove('active', 'text-[#FFD700]');
        b.classList.add('text-gray-500');
    });
    document.getElementById(`btn-${page}`).classList.add('active', 'text-[#FFD700]');
    
    const c = document.getElementById('main-app');
    if (page === 'home') renderHome(c);
    else if (page === 'tasks') renderTasks(c);
    else if (page === 'wallet') renderWallet(c);
    else if (page === 'history') renderHistory(c);
    else if (page === 'refer') renderRefer(c);
}

// 6. PAGE: HOME
function renderHome(c) {
    c.innerHTML = `
        <div class="glass-panel p-6 rounded-3xl text-center relative overflow-hidden mt-2 border-t border-white/10">
            <h1 class="text-6xl font-bold text-white mb-2">${currentUser.balance}</h1>
            <p class="text-xs text-[#FFD700] font-bold tracking-wide">Points Earned</p>
            <button onclick="router('tasks')" class="mt-6 w-full py-4 rounded-2xl gold-gradient text-black font-bold uppercase shadow-lg active:scale-95 transition">Start Earning</button>
        </div>
        <div class="grid grid-cols-2 gap-4 mt-6">
            <div class="glass-panel p-5 rounded-2xl flex flex-col items-center justify-center">
                <span class="text-2xl font-bold">${currentUser.referral_count}</span>
                <span class="text-[10px] text-gray-400 uppercase mt-1">Refers</span>
            </div>
            <div class="glass-panel p-5 rounded-2xl flex flex-col items-center justify-center">
                <span class="text-2xl font-bold text-green-400">Active</span>
                <span class="text-[10px] text-gray-400 uppercase mt-1">Status</span>
            </div>
        </div>
    `;
}

// 7. PAGE: TASKS (Ad Logic Implemented Here)
async function renderTasks(c) {
    c.innerHTML = `<div class="flex justify-center mt-20"><div class="loader"></div></div>`;
    
    const isLocked = appSettings.referral_lock && (currentUser.referral_count < appSettings.min_referrals_req);
    const need = appSettings.min_referrals_req - currentUser.referral_count;

    const { data: tasks } = await supabase.from('tasks').select('*').eq('is_active', true).order('id');
    const { data: logs } = await supabase.from('task_logs').select('task_id').eq('user_id', currentUser.id).eq('created_at', new Date().toISOString().split('T')[0]);

    const counts = {};
    if (logs) logs.forEach(l => counts[l.task_id] = (counts[l.task_id] || 0) + 1);
    const limit = appSettings.daily_task_limit;

    let html = ``;
    if (isLocked) {
        html += `<div class="bg-red-500/10 border border-red-500/50 p-4 rounded-xl mb-4 text-center text-xs text-red-400">
            <i class="fas fa-lock text-xl mb-2 block"></i> Locked! Refer ${need} more friends to unlock tasks.
        </div>`;
    }

    html += `<div class="space-y-4 pb-10">`;
    tasks.forEach(t => {
        const cnt = counts[t.id] || 0;
        const finished = cnt >= limit;
        const locked = isLocked || finished;

        html += `
            <div class="glass-panel p-4 rounded-2xl flex justify-between items-center ${locked?'opacity-50 grayscale':''}">
                <div>
                    <h4 class="font-bold text-sm text-white">${t.title}</h4>
                    <span class="text-[10px] text-[#FFD700] border border-[#FFD700]/20 px-1.5 py-0.5 rounded">+${t.reward}</span>
                    <span class="text-[10px] text-gray-500 ml-2">${cnt}/${limit}</span>
                </div>
                <button onclick="handleTask(${t.id}, ${t.reward}, '${t.task_type}', '${t.link}')" 
                    ${locked?'disabled':''} class="px-4 py-2 rounded-xl text-xs font-bold gold-gradient text-black shadow-lg active:scale-95 transition">
                    ${finished ? 'Done' : (t.task_type==='direct_ad' ? 'Visit' : 'Start')}
                </button>
            </div>`;
    });
    c.innerHTML = html + `</div>`;
}

// MONETAG AD FLOW: Direct Link -> Timer -> Interstitial -> Reward
window.handleTask = async (tid, rew, type, link) => {
    if (type === 'direct_ad') {
        const url = (link && link !== 'null') ? link : appSettings.monetag_direct_link;
        if (!url) return Swal.fire('Error', 'Link not set by admin', 'error');

        window.open(url, '_blank');
        
        let timerInterval;
        Swal.fire({
            title: 'Please Wait',
            html: 'Watching Ad... <b>10</b> seconds remaining.',
            timer: DIRECT_LINK_WAIT_TIME,
            timerProgressBar: true,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
                const b = Swal.getHtmlContainer().querySelector('b');
                timerInterval = setInterval(() => { b.textContent = Math.ceil(Swal.getTimerLeft() / 1000) }, 100);
            },
            willClose: () => clearInterval(timerInterval)
        }).then((result) => {
            if (result.dismiss === Swal.DismissReason.timer) {
                // Show Interstitial after timer
                showInterstitialAndReward(tid, rew);
            }
        });
    } else if (type === 'video') {
        if(adFuncs.rewarded && window[adFuncs.rewarded]) {
            window[adFuncs.rewarded]().then(() => { claimReward(tid, rew); });
        } else {
            Swal.fire('Error', 'Ad not ready yet. Try again.', 'error');
        }
    } else {
        if(link) window.open(link, '_blank');
        setTimeout(() => claimReward(tid, rew), 5000);
    }
};

function showInterstitialAndReward(tid, rew) {
    if (adFuncs.interstitial && window[adFuncs.interstitial]) {
        // Show Interstitial Code from User's Snippet
        window[adFuncs.interstitial]({
            type: 'inApp',
            inAppSettings: { frequency: 2, capping: 0.1, interval: 30, timeout: 5, everyPage: false }
        }).then(() => {
            claimReward(tid, rew);
        }).catch(() => {
            claimReward(tid, rew); // Claim even if ad fails to load after wait
        });
    } else {
        claimReward(tid, rew);
    }
}

async function claimReward(tid, rew) {
    const { data: res } = await supabase.rpc('claim_task', { 
        p_user_id: currentUser.id, p_task_id: tid, p_reward: rew, p_limit: appSettings.daily_task_limit 
    });
    if (res && res.success) {
        currentUser.balance += rew; updateUI();
        Swal.fire({ icon: 'success', title: `+${rew} Points`, toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        router('tasks');
    } else {
        Swal.fire('Error', res?.message, 'error');
    }
}

// 8. PAGE: WALLET (Dynamic Payment Methods)
function renderWallet(c) {
    const bdt = (currentUser.balance * appSettings.conversion_rate).toFixed(2);
    
    // Admin থেকে পেমেন্ট মেথড লোড করা
    let methodsHtml = '';
    if (appSettings.payment_methods && Array.isArray(appSettings.payment_methods)) {
        appSettings.payment_methods.forEach(m => {
            methodsHtml += `<option value="${m}">${m}</option>`;
        });
    } else {
        methodsHtml = `<option value="Bkash">Bkash</option>`; // Default
    }

    c.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl text-center mb-6 mt-4">
            <h1 class="text-5xl font-bold gold-text my-3">\u09F3 ${bdt}</h1>
            <p class="text-[10px] text-gray-400">Min Withdraw: \u09F3 ${appSettings.min_withdraw_amount}</p>
        </div>
        <div class="space-y-3">
            <label class="text-xs text-gray-400 ml-1">Payment Method</label>
            <select id="w-method" class="custom-input">${methodsHtml}</select>
            
            <label class="text-xs text-gray-400 ml-1">Account Number</label>
            <input type="number" id="w-num" placeholder="017xxxxxxxx" class="custom-input">
            
            <label class="text-xs text-gray-400 ml-1">Amount (BDT)</label>
            <input type="number" id="w-amt" placeholder="Amount" class="custom-input">
            
            <button onclick="processWithdraw()" class="w-full py-4 rounded-xl gold-gradient text-black font-bold mt-4 shadow-lg active:scale-95 transition">Withdraw</button>
        </div>`;
}

async function processWithdraw() {
    const method = document.getElementById('w-method').value;
    const num = document.getElementById('w-num').value;
    const amt = parseInt(document.getElementById('w-amt').value);
    const pts = amt / appSettings.conversion_rate;

    if (!num || !amt) return Swal.fire('Error', 'Fill all fields', 'warning');
    if (amt < appSettings.min_withdraw_amount) return Swal.fire('Error', `Min \u09F3${appSettings.min_withdraw_amount}`, 'warning');
    
    const { data: res } = await supabase.rpc('process_withdrawal', { 
        p_user_id: currentUser.id, p_method: method, p_number: num, p_amount_bdt: amt, p_points_needed: pts 
    });
    
    if (res.success) {
        currentUser.balance -= pts; updateUI();
        Swal.fire('Success', 'Request Sent!', 'success'); router('history');
    } else Swal.fire('Error', res.message, 'error');
}

// 9. PAGE: HISTORY (Empty State Fix)
function renderHistory(c) {
    c.innerHTML = `<div class="text-center mt-10"><div class="loader"></div></div>`;
    supabase.from('withdrawals').select('*').eq('user_id', currentUser.id).order('created_at', {ascending:false})
    .then(({data}) => {
        if (!data || data.length === 0) {
            c.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full mt-20 opacity-50">
                    <i class="fas fa-history text-4xl mb-3 text-gray-500"></i>
                    <p class="text-sm text-gray-400">No transactions yet</p>
                </div>
            `;
            return;
        }
        let html = `<div class="space-y-3 mt-4">`;
        data.forEach(i => {
            html += `<div class="glass-panel p-4 rounded-xl flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-white">\u09F3 ${i.amount_bdt}</h4>
                    <p class="text-[10px] text-gray-400">${new Date(i.created_at).toLocaleDateString()} via ${i.method}</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-1 rounded bg-white/5 uppercase ${i.status==='paid'?'text-green-400':'text-yellow-400'}">${i.status}</span>
            </div>`;
        });
        c.innerHTML = html + `</div>`;
    });
}

// 10. PAGE: REFER (Bonus Display Fix)
function renderRefer(c) {
    const link = `${window.location.origin}${window.location.pathname}?ref=${currentUser.id}`;
    
    // Calculation for Total Bonus Earned
    const totalBonus = currentUser.referral_count * appSettings.referral_bonus;

    c.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl text-center mt-4 border border-[#FFD700]/30">
            <h2 class="text-2xl font-bold text-white">Invite & Earn</h2>
            <p class="text-xs text-gray-400 mt-2 px-4">Refer friends using your phone number!</p>
        </div>
        <div class="glass-panel p-3 rounded-xl mt-6 flex items-center gap-3 bg-black/30 border border-white/10">
            <input type="text" value="${link}" readonly class="bg-transparent text-xs w-full text-gray-300 outline-none font-mono" id="ref-link">
            <button onclick="copyLink()" class="p-2.5 bg-[#FFD700] rounded-lg text-black font-bold text-xs"><i class="fas fa-copy"></i></button>
        </div>
        <div class="mt-6 glass-panel p-5 rounded-xl flex justify-between items-center">
            <div><p class="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Total Referrals</p><h4 class="text-3xl font-bold text-white">${currentUser.referral_count}</h4></div>
            <div class="text-right"><p class="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Earned Bonus</p><h4 class="text-3xl font-bold text-[#FFD700]">${totalBonus}</h4></div>
        </div>`;
}

window.copyLink = () => {
    const copyText = document.getElementById("ref-link");
    copyText.select();
    document.execCommand("copy");
    Swal.fire({ icon: 'success', title: 'Copied!', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
};

// START
initApp();
