// ==================== PREMIUM REWARDS - FULLY WORKING SCRIPT.JS ====================

const SUPABASE_URL = 'https://wnmwvbeydsrehtsnkfoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubXd2YmV5ZHNyZWh0c25rZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDg4MzIsImV4cCI6MjA3OTg4NDgzMn0.4vSObxBEr8r11-dqkp9y6bVroMVoSTEnIOTF8Vo8sxk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;

let currentUser = null;
let appSettings = {
    conversion_rate: 0.05,
    min_withdraw_amount: 50,
    daily_task_limit: 10,
    anti_cheat_enabled: true,
    bot_username: 'YourBot_bot', // এখানে আপনার বটের ইউজারনেম দিন (যেমন: myearn_bot)
    referral_bonus: 50,
    monetag_interstitial_id: null,
    monetag_rewarded_id: null,
    monetag_popup_id: null,
    monetag_direct_link: null,
    home_banner_url: null,
    referral_lock: false,
    min_referrals_req: 3
};

let adFuncs = { interstitial: null, rewarded: null, popup: null };
let pendingTask = null;
let adStartTime = 0;
const MIN_AD_DURATION = 10000; // 10 seconds

// ==================== APP INIT ====================
async function initApp() {
    tg.expand();
    tg.ready();

    const tgUser = tg.initDataUnsafe?.user;
    if (!tgUser) {
        showError("Telegram থেকে খুলুন");
        return;
    }

    try {
        // Settings লোড (কোনো এরর হলে ডিফল্ট থাকবে)
        const { data: settings } = await supabase.from('settings').select('*').limit(1);
        if (settings && settings[0]) {
            appSettings = { ...appSettings, ...settings[0] };
        }

        // Monetag অ্যাড স্ক্রিপ্ট লোড
        if (appSettings.monetag_interstitial_id) loadAdScript(appSettings.monetag_interstitial_id, 'interstitial');
        if (appSettings.monetag_rewarded_id) loadAdScript(appSettings.monetag_rewarded_id, 'rewarded');
        if (appSettings.monetag_popup_id) loadAdScript(appSettings.monetag_popup_id, 'popup');

        // ইউজার লোড বা রেজিস্টার
        let { data: user } = await supabase.from('users').select('*').eq('id', tgUser.id).maybeSingle();

        if (!user) {
            const startParam = tg.initDataUnsafe?.start_param;
            let refId = (startParam && startParam != tgUser.id) ? parseInt(startParam) : null;

            if (appSettings.anti_cheat_enabled && refId && localStorage.getItem('ref_used')) refId = null;

            const { data: newUser } = await supabase.from('users')
                .insert([{
                    id: tgUser.id,
                    first_name: tgUser.first_name || 'User',
                    username: tgUser.username,
                    photo_url: tgUser.photo_url,
                    referred_by: refId,
                    balance: 0,
                    referral_count: 0
                }])
                .select()
                .single();

            user = newUser;
            if (refId) {
                supabase.rpc('increment_referral', { referrer_id: refId });
                if (appSettings.anti_cheat_enabled) localStorage.setItem('ref_used', 'true');
            }
        }

        currentUser = user;
        updateUI();

        // লোডিং হাইড করুন
        document.getElementById('loading-screen').remove();
        document.getElementById('main-app').classList.remove('hidden');
        router('home');

    } catch (err) {
        console.error(err);
        showError("ইন্টারনেট চেক করুন বা রিফ্রেশ করুন");
    }
}

function loadAdScript(zoneId, type) {
    const script = document.createElement('script');
    script.src = '//libtl.com/sdk.js';
    const funcName = 'show_' + zoneId;
    script.setAttribute('data-zone', zoneId);
    script.setAttribute('data-sdk', funcName);
    script.onload = () => {
        adFuncs[type] = funcName;
        console.log(type + " ad loaded:", funcName);
    };
    script.onerror = () => console.warn(type + " ad failed to load");
    document.head.appendChild(script);
}

function showError(msg) {
    document.getElementById('error-msg').innerText = msg;
    document.getElementById('error-box').classList.remove('hidden');
    document.querySelector('.loader').style.display = 'none';
}

function updateUI() {
    if (!currentUser) return;
    document.getElementById('user-name').innerText = currentUser.first_name || 'User';
    document.getElementById('user-balance').innerText = Math.floor(currentUser.balance || 0);
    if (currentUser.photo_url) document.getElementById('user-photo').src = currentUser.photo_url;
}

// ==================== ROUTER ====================
function router(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active', 'text-[#FFD700]');
        el.classList.add('text-gray-500');
    });
    document.getElementById(`btn-${page}`).classList.add('active', 'text-[#FFD700]');

    const c = document.getElementById('main-app');
    if (page === 'home') renderHome(c);
    if (page === 'tasks') renderTasks(c);
    if (page === 'wallet') renderWallet(c);
    if (page === 'history') renderHistory(c);
    if (page === 'refer') renderRefer(c);
}

// ==================== PAGES ====================
function renderHome(c) {
    const bdt = (currentUser.balance * appSettings.conversion_rate).toFixed(2);
    c.innerHTML = `
        <div class="glass-panel p-6 rounded-3xl text-center relative overflow-hidden mt-4 shadow-2xl">
            <div class="absolute -top-10 -left-10 w-40 h-40 bg-[#FFD700] rounded-full blur-[80px] opacity-20"></div>
            <p class="text-gray-400 text-xs uppercase tracking-[3px] mb-2 font-bold">Total Earnings</p>
            <h1 class="text-6xl font-bold text-white mb-2">${Math.floor(currentUser.balance)}</h1>
            <p class="text-xs text-[#FFD700] font-bold">≈ ৳ ${bdt} BDT</p>
            <button onclick="router('tasks')" class="mt-8 w-full py-4 rounded-2xl gold-gradient text-black font-bold shadow-lg active:scale-95">
                Start Earning
            </button>
        </div>
        <div class="grid grid-cols-2 gap-4 mt-6">
            <div class="glass-panel p-5 rounded-2xl text-center">
                <i class="fas fa-users text-3xl mb-2 text-blue-400"></i>
                <span class="text-2xl font-bold">${currentUser.referral_count || 0}</span>
                <p class="text-xs text-gray-400">Referrals</p>
            </div>
            <div class="glass-panel p-5 rounded-2xl text-center">
                <i class="fas fa-check-circle text-3xl mb-2 text-green-400"></i>
                <span class="text-2xl font-bold">Active</span>
                <p class="text-xs text-gray-400">Status</p>
            </div>
        </div>
    `;
}

async function renderTasks(c) {
    c.innerHTML = '<div class="text-center mt-20"><div class="loader"></div></div>';

    const { data: tasks } = await supabase.from('tasks').select('*').eq('is_active', true);
    const today = new Date().toISOString().slice(0, 10);
    const { data: logs } = await supabase.from('task_logs')
        .select('task_id')
        .eq('user_id', currentUser.id)
        .gte('created_at', today + 'T00:00:00')
        .lt('created_at', today + 'T23:59:59');

    const counts = {};
    logs?.forEach(l => counts[l.task_id] = (counts[l.task_id] || 0) + 1);

    const limit = appSettings.daily_task_limit || 10;
    const locked = appSettings.referral_lock && (currentUser.referral_count < appSettings.min_referrals_req);

    let html = `<div class="text-xl font-bold mb-4">Tasks (${limit} per day)</div>`;

    if (locked) {
        html += `<div class="bg-red-500/20 border border-red-500/50 p-4 rounded-xl text-center mb-4">
            Invite ${appSettings.min_referrals_req - currentUser.referral_count} more to unlock!
        </div>`;
    }

    tasks?.forEach(t => {
        const done = counts[t.id] || 0;
        const disabled = locked || done >= limit;
        html += `
            <div class="glass-panel p-4 rounded-2xl mb-4 ${disabled ? 'opacity-50' : ''}">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-[#FFD700]">
                            <i class="fas fa-${t.task_type === 'video' ? 'play-circle' : t.task_type === 'telegram' ? 'paper-plane' : 'globe'}"></i>
                        </div>
                        <div>
                            <h3 class="font-bold">${t.title}</h3>
                            <p class="text-xs text-[#FFD700]">+${t.reward} points</p>
                        </div>
                    </div>
                    <button onclick="handleTask(\( {t.id}, \){t.reward}, '\( {t.task_type}', ' \){t.link || ''}')" 
                        ${disabled ? 'disabled' : ''} 
                        class="px-6 py-3 rounded-xl font-bold ${disabled ? 'bg-gray-600' : 'gold-gradient text-black'}">
                        ${done >= limit ? 'Done' : 'Go'}
                    </button>
                </div>
            </div>`;
    });

    c.innerHTML = html || '<div class="text-center text-gray-500 mt-20">No tasks available</div>';
}

// ==================== AD & CLAIM SYSTEM ====================
window.handleTask = (tid, rew, type, link) => {
    pendingTask = { id: tid, reward: rew };
    adStartTime = Date.now();

    if (type === 'direct_ad') {
        const url = link || appSettings.monetag_direct_link || 'https://google.com';
        window.open(url, '_blank');
        if (adFuncs.interstitial) setTimeout(() => window[adFuncs.interstitial]?.(), 1500);
    }
    else if (type === 'telegram') {
        window.open(link || 'https://t.me/', '_blank');
        if (adFuncs.popup) window[adFuncs.popup]?.('pop');
    }
    else if (type === 'video') {
        if (adFuncs.rewarded) {
            window[adFuncs.rewarded]().then(() => claimReward(tid, rew)).catch(() => Swal.fire('Ad Failed', 'Try again', 'error'));
            return;
        }
    }
    else {
        window.open(link || 'https://google.com', '_blank');
        if (adFuncs.interstitial) window[adFuncs.interstitial]?.();
    }

    // ফলব্যাক: ১২ সেকেন্ড পর কনফার্ম
    setTimeout(() => {
        if (pendingTask?.id === tid) {
            Swal.fire({
                title: 'Task Complete?',
                text: 'Click Yes to claim reward',
                showCancelButton: true,
                confirmButtonText: 'Yes',
                confirmButtonColor: '#FFD700'
            }).then(r => r.isConfirmed && claimReward(tid, rew));
        }
    }, 12000);
};

async function claimReward(tid, rew) {
    if (Date.now() - adStartTime < MIN_AD_DURATION) {
        Swal.fire('Too Fast!', 'Wait 10 seconds', 'warning');
        return;
    }

    Swal.showLoading();
    const { data } = await supabase.rpc('claim_task', {
        p_user_id: currentUser.id,
        p_task_id: tid,
        p_reward: rew,
        p_limit: appSettings.daily_task_limit
    });
    Swal.close();

    if (data?.success) {
        currentUser.balance += rew;
        updateUI();
        Swal.fire({ icon: 'success', title: `+${rew} Points!`, toast: true, position: 'top-end', timer: 2000 });
        router('tasks');
    } else {
        Swal.fire('Error', data?.message || 'Try again', 'error');
    }
    pendingTask = null;
}

// ==================== WALLET, HISTORY, REFER ====================
function renderWallet(c) {
    const bdt = (currentUser.balance * appSettings.conversion_rate).toFixed(2);
    c.innerHTML = `
        <div class="glass-panel p-6 rounded-3xl text-center mb-6">
            <h1 class="text-5xl font-bold gold-text">৳ ${bdt}</h1>
            <p class="text-xs text-gray-400 mt-2">Min withdraw: ৳ ${appSettings.min_withdraw_amount}</p>
        </div>
        <input id="w-num" class="custom-input mb-4" placeholder="Bkash Number">
        <input id="w-amt" type="number" class="custom-input mb-4" placeholder="Amount">
        <button onclick="processWithdraw()" class="w-full py-4 gold-gradient text-black font-bold rounded-2xl">Withdraw</button>
    `;
}

async function processWithdraw() {
    const num = document.getElementById('w-num').value;
    const amt = parseFloat(document.getElementById('w-amt').value);
    if (!num || !amt || amt < appSettings.min_withdraw_amount) return Swal.fire('Invalid', 'Check amount/number', 'warning');

    const pointsNeeded = amt / appSettings.conversion_rate;
    if (currentUser.balance < pointsNeeded) return Swal.fire('Low Balance', '', 'error');

    const { data } = await supabase.rpc('process_withdrawal', {
        p_user_id: currentUser.id,
        p_method: 'Bkash',
        p_number: num,
        p_amount_bdt: amt,
        p_points_needed: pointsNeeded
    });

    if (data?.success) {
        currentUser.balance -= pointsNeeded;
        updateUI();
        Swal.fire('Success!', 'Withdrawal requested', 'success');
        router('history');
    } else {
        Swal.fire('Failed', data?.message || 'Try later', 'error');
    }
}

async function renderHistory(c) {
    const { data } = await supabase.from('withdrawals').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    c.innerHTML = data?.length ? data.map(w => `
        <div class="glass-panel p-4 rounded-xl mb-3 flex justify-between">
            <div>৳ \( {w.amount_bdt} - \){w.status}</div>
            <div class="text-xs text-gray-400">${new Date(w.created_at).toLocaleDateString()}</div>
        </div>
    `).join('') : '<div class="text-center text-gray-500 mt-20">No history</div>';
}

function renderRefer(c) {
    const link = `https://t.me/\( {appSettings.bot_username}?start= \){currentUser.id}`;
    c.innerHTML = `
        <div class="glass-panel p-6 rounded-3xl text-center">
            <h2 class="text-2xl font-bold mb-4">Invite & Earn ${appSettings.referral_bonus} Points!</h2>
            <div class="flex gap-2 mb-4">
                <input value="${link}" readonly id="reflink" class="custom-input">
                <button onclick="navigator.clipboard.writeText('${link}').then(()=>Swal.fire({title:'Copied!',toast:true,position:'top-end',timer:1500}))" class="gold-gradient px-4 rounded">
                    Copy
                </button>
            </div>
            <p class="text-3xl font-bold">${currentUser.referral_count || 0} Referrals</p>
        </div>
    `;
}

// ==================== START ====================
window.onload = () => initApp();
