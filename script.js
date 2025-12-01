// 1. CONFIGURATION
const SUPABASE_URL = 'https://wnmwvbeydsrehtsnkfoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubXd2YmV5ZHNyZWh0c25rZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDg4MzIsImV4cCI6MjA3OTg4NDgzMn0.4vSObxBEr8r11-dqkp9y6bVroMVoSTEnIOTF8Vo8sxk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables
let currentUser = null;
let appSettings = {};
let adFuncs = { interstitial: null, rewarded: null, popup: null };
const REQUIRED_TIME = 15000; // 15 Seconds Waiting Time

// Device ID Generator
function getDeviceFingerprint() {
    return 'DEV-' + navigator.userAgent.replace(/\D+/g, '').substring(0, 12);
}

// 2. INITIALIZATION
async function initApp() {
    try {
        const { data: s } = await supabase.from('settings').select('*').single();
        appSettings = s || {};

        // Load Ads
        if(appSettings.monetag_interstitial_id) loadAdScript(appSettings.monetag_interstitial_id, 'interstitial');
        if(appSettings.monetag_rewarded_id) loadAdScript(appSettings.monetag_rewarded_id, 'rewarded');
        if(appSettings.monetag_popup_id) loadAdScript(appSettings.monetag_popup_id, 'popup');

        // Check Login
        const uid = localStorage.getItem('user_id');
        if (uid) await fetchUser(uid);
        else showAuth();

        // Referral Check
        const params = new URLSearchParams(window.location.search);
        if (params.get('ref')) {
            toggleAuth('signup');
            document.getElementById('auth-ref').value = params.get('ref');
        }
    } catch (e) {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('error-box').classList.remove('hidden');
    }
}

// 3. AUTH SYSTEM
function showAuth() {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
}

function toggleAuth(mode) {
    const login = document.getElementById('tab-login');
    const signup = document.getElementById('tab-signup');
    const extra = document.getElementById('signup-fields');
    
    if(mode === 'login') {
        login.className = "flex-1 py-2 rounded-md text-sm font-bold bg-[#FFD700] text-black";
        signup.className = "flex-1 py-2 rounded-md text-sm font-bold text-gray-400";
        extra.classList.add('hidden');
        document.getElementById('auth-btn').onclick = handleLogin;
    } else {
        signup.className = "flex-1 py-2 rounded-md text-sm font-bold bg-[#FFD700] text-black";
        login.className = "flex-1 py-2 rounded-md text-sm font-bold text-gray-400";
        extra.classList.remove('hidden');
        document.getElementById('auth-btn').onclick = handleRegister;
    }
}

async function handleLogin() {
    const phone = document.getElementById('auth-phone').value;
    const pass = document.getElementById('auth-pass').value;
    if(!phone || !pass) return Swal.fire('Error', 'Fill all fields', 'warning');
    
    Swal.showLoading();
    const { data } = await supabase.from('users').select('*').eq('id', phone).eq('password', pass).single();
    Swal.close();

    if(data) {
        localStorage.setItem('user_id', data.id);
        await fetchUser(data.id);
    } else {
        Swal.fire('Error', 'Invalid credentials', 'error');
    }
}

async function handleRegister() {
    const phone = document.getElementById('auth-phone').value;
    const pass = document.getElementById('auth-pass').value;
    const name = document.getElementById('auth-name').value;
    const ref = document.getElementById('auth-ref').value;
    
    if(!phone || !pass || !name) return Swal.fire('Error', 'Fill all fields', 'warning');
    
    Swal.showLoading();
    const { data: res, error } = await supabase.rpc('handle_new_user', {
        p_phone: parseInt(phone), p_pass: pass, p_name: name,
        p_referrer: ref ? parseInt(ref) : null, p_device_id: getDeviceFingerprint()
    });
    Swal.close();

    if(res && res.success) {
        localStorage.setItem('user_id', phone);
        await fetchUser(phone);
    } else {
        Swal.fire('Failed', res?.message || error?.message, 'error');
    }
}

async function fetchUser(uid) {
    const { data } = await supabase.from('users').select('*').eq('id', uid).single();
    if(data) {
        currentUser = data;
        updateUI();
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('app-header').classList.remove('hidden');
        document.getElementById('app-nav').classList.remove('hidden');
        router('home');
    } else {
        localStorage.removeItem('user_id');
        location.reload();
    }
}

// ==========================================
// 4. TASK LOGIC (100% WORKING TIMER)
// ==========================================

// Visibility Listener: ব্যাক করলে চেক করবে কতক্ষণ ছিল
document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
        const start = localStorage.getItem('t_start');
        const tid = localStorage.getItem('t_id');
        const rew = localStorage.getItem('t_rew');

        if(start && tid) {
            const diff = Date.now() - parseInt(start);
            
            // ১৫ সেকেন্ড চেক
            if(diff >= REQUIRED_TIME) {
                await addPoints(tid, rew);
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Task Failed',
                    text: `You must stay for 15 seconds. You returned in ${(diff/1000).toFixed(1)}s`,
                    confirmButtonColor: '#FFD700'
                });
            }
            
            // স্টোরেজ ক্লিন
            localStorage.removeItem('t_start');
            localStorage.removeItem('t_id');
            localStorage.removeItem('t_rew');
        }
    }
});

window.handleTask = (tid, rew, type, link) => {
    // A. Direct Link / Offer Wheel (Timer Based)
    if(type === 'direct_ad' || type === 'offer_wheel') {
        const url = (link && link !== 'null') ? link : appSettings.monetag_direct_link;
        if(!url) return Swal.fire('Error', 'Link Not Configured', 'error');

        // স্টার্ট টাইম সেভ
        localStorage.setItem('t_start', Date.now());
        localStorage.setItem('t_id', tid);
        localStorage.setItem('t_rew', rew);

        window.open(url, '_blank');
        
        Swal.fire({
            title: 'Wait 15 Seconds',
            text: 'Do not close the page immediately to get reward.',
            timer: 3000,
            showConfirmButton: false
        });
    }
    // B. Rewarded Video (Ad Network Logic)
    else if(type === 'video' || type === 'rewarded_ads') {
        if(adFuncs.rewarded && window[adFuncs.rewarded]) {
            Swal.showLoading();
            // অ্যাড দেখাও
            window[adFuncs.rewarded]().then(() => {
                Swal.close();
                // অ্যাড দেখা শেষ হলে পয়েন্ট অ্যাড
                addPoints(tid, rew);
            }).catch(e => {
                Swal.close();
                Swal.fire('Failed', 'You closed the ad early!', 'error');
            });
        } else {
            Swal.fire('Loading', 'Ad is not ready. Try again in 5s.', 'warning');
        }
    }
    // C. Telegram / Other
    else {
        if(link) window.open(link, '_blank');
        setTimeout(() => addPoints(tid, rew), 5000);
    }
};

async function addPoints(tid, rew) {
    Swal.fire({title: 'Adding Points...', didOpen: () => Swal.showLoading()});
    
    try {
        const { data: res, error } = await supabase.rpc('claim_task', {
            p_user_id: parseInt(currentUser.id),
            p_task_id: parseInt(tid),
            p_reward: parseFloat(rew),
            p_limit: parseInt(appSettings.daily_task_limit)
        });

        Swal.close();

        if(res && res.success) {
            currentUser.balance += parseFloat(rew);
            updateUI();
            Swal.fire({
                icon: 'success', 
                title: `+${rew} Points`, 
                timer: 1500, 
                showConfirmButton: false
            });
            router('tasks');
        } else {
            Swal.fire('Notice', res?.message || error?.message, 'warning');
        }
    } catch(e) {
        Swal.close();
        console.error(e);
    }
}

// 5. WITHDRAW LOGIC (FIXED BUTTON)
async function processWithdraw() {
    const num = document.getElementById('w-num').value;
    const amtVal = document.getElementById('w-amt').value;
    const method = document.getElementById('w-method').value;

    if(!num || !amtVal) return Swal.fire('Error', 'Fill all fields', 'warning');

    const amt = parseFloat(amtVal);
    const pts = parseFloat((amt / appSettings.conversion_rate).toFixed(2));

    if(amt < appSettings.min_withdraw_amount) return Swal.fire('Error', `Minimum withdraw is ${appSettings.min_withdraw_amount} Taka`, 'warning');
    if(currentUser.balance < pts) return Swal.fire('Error', `Insufficient Balance. You need ${pts} Points`, 'error');

    document.getElementById('w-btn').innerText = "Processing...";
    document.getElementById('w-btn').disabled = true;
    
    const { data: res, error } = await supabase.rpc('process_withdrawal', {
        p_user_id: parseInt(currentUser.id),
        p_method: method,
        p_number: num,
        p_amount_bdt: amt,
        p_points_needed: pts
    });

    document.getElementById('w-btn').innerText = "WITHDRAW";
    document.getElementById('w-btn').disabled = false;

    if(res && res.success) {
        currentUser.balance -= pts;
        updateUI();
        Swal.fire('Success', 'Withdrawal Request Submitted!', 'success');
        router('history');
    } else {
        Swal.fire('Failed', res?.message || error?.message, 'error');
    }
}

// 6. UI HELPERS
function loadAdScript(zoneId, type) {
    const s = document.createElement('script');
    s.src = '//libtl.com/sdk.js';
    s.dataset.zone = zoneId;
    s.dataset.sdk = 'show_' + zoneId;
    s.onload = () => adFuncs[type] = window['show_' + zoneId];
    document.head.appendChild(s);
}

function updateUI() {
    if(!currentUser) return;
    document.getElementById('user-name').innerText = currentUser.first_name;
    document.getElementById('user-balance').innerText = Math.floor(currentUser.balance);
    document.getElementById('user-photo').src = `https://ui-avatars.com/api/?name=${currentUser.first_name}&background=random`;
}

function router(page) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('text-[#FFD700]'));
    document.getElementById('btn-'+page).classList.add('text-[#FFD700]');
    
    const c = document.getElementById('main-app');
    if(page === 'home') renderHome(c);
    else if(page === 'tasks') renderTasks(c);
    else if(page === 'wallet') renderWallet(c);
    else if(page === 'history') renderHistory(c);
    else if(page === 'refer') renderRefer(c);
}

// UI RENDERS
function renderHome(c) {
    c.innerHTML = `
    <div class="glass-panel p-6 rounded-3xl text-center mt-4 border-t border-white/10">
        <h1 class="text-5xl font-bold text-white mb-2">${Math.floor(currentUser.balance)}</h1>
        <p class="text-xs text-[#FFD700] tracking-widest">POINTS</p>
        <button onclick="router('tasks')" class="mt-6 w-full py-3 rounded-xl gold-gradient text-black font-bold uppercase shadow-lg">Start Earning</button>
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
    ${appSettings.home_banner_url ? `<img src="${appSettings.home_banner_url}" class="w-full h-32 object-cover rounded-xl mt-4 border border-white/10">` : ''}`;
}

async function renderTasks(c) {
    c.innerHTML = `<div class="flex justify-center mt-20"><div class="loader"></div></div>`;
    const { data: tasks } = await supabase.from('tasks').select('*').eq('is_active', true).order('id');
    const { data: logs } = await supabase.from('task_logs').select('task_id').eq('user_id', currentUser.id).eq('created_at', new Date().toISOString().split('T')[0]);
    
    const counts = {};
    if(logs) logs.forEach(l => counts[l.task_id] = (counts[l.task_id] || 0) + 1);
    const limit = appSettings.daily_task_limit;

    let html = `<div class="space-y-4 mt-4 pb-20">`;
    tasks.forEach(t => {
        const done = counts[t.id] || 0;
        const disabled = done >= limit;
        let icon = (t.task_type === 'video' || t.task_type === 'rewarded_ads') ? 'play-circle' : 'globe';
        
        html += `
        <div class="glass-panel p-4 rounded-2xl flex justify-between items-center ${disabled ? 'opacity-50' : ''}">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-[#FFD700] text-xl"><i class="fas fa-${icon}"></i></div>
                <div>
                    <h4 class="font-bold text-white">${t.title}</h4>
                    <span class="text-xs text-[#FFD700] font-bold">+${t.reward} • ${done}/${limit}</span>
                </div>
            </div>
            <button onclick="handleTask(${t.id}, ${t.reward}, '${t.task_type}', '${t.link}')" ${disabled?'disabled':''} class="px-5 py-2 rounded-lg bg-[#FFD700] text-black font-bold text-xs">${disabled ? 'Done' : 'Start'}</button>
        </div>`;
    });
    c.innerHTML = html + `</div>`;
}

function renderWallet(c) {
    let opts = '';
    appSettings.payment_methods.forEach(m => opts += `<option value="${m}">${m}</option>`);
    
    c.innerHTML = `
    <div class="glass-panel p-6 rounded-2xl text-center mt-4">
        <h1 class="text-4xl font-bold text-white">\u09F3 ${(currentUser.balance * appSettings.conversion_rate).toFixed(2)}</h1>
        <p class="text-xs text-gray-400">Min Withdraw: ${appSettings.min_withdraw_amount} TK</p>
    </div>
    <div class="space-y-4 mt-6">
        <select id="w-method" class="custom-input">${opts}</select>
        <input type="number" id="w-num" placeholder="Number" class="custom-input">
        <input type="number" id="w-amt" placeholder="Amount" class="custom-input">
        <button id="w-btn" onclick="processWithdraw()" class="w-full py-3 rounded-xl gold-gradient text-black font-bold">WITHDRAW</button>
    </div>`;
}

function renderRefer(c) {
    const link = `${location.origin}${location.pathname}?ref=${currentUser.id}`;
    c.innerHTML = `
    <div class="glass-panel p-6 rounded-2xl text-center mt-4 border border-[#FFD700]/30">
        <h2 class="text-2xl font-bold text-white">Refer & Earn</h2>
        <p class="text-xs text-gray-400 mt-2">Bonus: ${appSettings.referral_bonus} Points</p>
    </div>
    <div class="glass-panel p-3 rounded-xl mt-6 flex items-center gap-2 bg-black/30">
        <input type="text" value="${link}" readonly class="bg-transparent text-xs w-full text-white" id="ref-link">
        <button onclick="copyLink()" class="p-2 bg-[#FFD700] rounded text-black"><i class="fas fa-copy"></i></button>
    </div>`;
}

function renderHistory(c) {
    c.innerHTML = `<div class="text-center mt-10"><div class="loader"></div></div>`;
    supabase.from('withdrawals').select('*').eq('user_id', currentUser.id).order('created_at', {ascending:false})
    .then(({data}) => {
        let html = `<div class="space-y-3 mt-4">`;
        if(data.length === 0) html = `<div class="text-center text-gray-500 mt-20">No history</div>`;
        else data.forEach(i => {
            html += `<div class="glass-panel p-4 rounded-xl flex justify-between items-center">
                <div><h4 class="font-bold text-white">\u09F3 ${i.amount_bdt}</h4><p class="text-[10px] text-gray-400">${i.method}</p></div>
                <span class="text-[10px] font-bold px-2 py-1 rounded bg-white/10 ${i.status==='paid'?'text-green-400':'text-yellow-400'}">${i.status}</span>
            </div>`;
        });
        c.innerHTML = html + `</div>`;
    });
}

function copyLink() {
    navigator.clipboard.writeText(document.getElementById("ref-link").value);
    Swal.fire({icon: 'success', title: 'Copied', toast: true, position: 'top', showConfirmButton: false, timer: 1000});
}

initApp();
