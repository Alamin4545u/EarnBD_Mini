// --- CONFIGURATION ---
const SUPABASE_URL = 'https://wnmwvbeydsrehtsnkfoc.supabase.co';

// IMPORTANT: Do NOT keep service_role or other secret keys on client-side.
// Replace the value below with your anon public key (or better: fetch from your backend)
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubXd2YmV5ZHNyZWh0c25rZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDg4MzIsImV4cCI6MjA3OTg4NDgzMn0.4vSObxBEr8r11-dqkp9y6bVroMVoSTEnIOTF8Vo8sxk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram?.WebApp || {};

// State Variables
let currentUser = null;
let appSettings = {};
let adFuncs = { interstitial: null, rewarded: null, popup: null };
let adStartTime = 0;
let pendingTask = null;
const MIN_AD_DURATION = 10000; // 10 Seconds

// --- FAST APP INITIALIZATION ---
async function initApp() {
    try {
        // Telegram safety: make sure it's a Telegram WebApp
        if (tg.expand) tg.expand();
        if (tg.setHeaderColor && typeof tg.setHeaderColor === 'function') {
            try { tg.setHeaderColor('#0f0f0f'); } catch(e) { /* ignore if not allowed */ }
        }

        const tgUser = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : null;
        if (!tgUser) return showError("Please open inside Telegram.");

        // Parallel fetching of settings and user
        const [{ data: settingsData, error: settingsErr }, { data: userData, error: userErr }] =
            await Promise.all([
                supabase.from('settings').select('*').single(),
                supabase.from('users').select('*').eq('id', tgUser.id).single()
            ]);

        if (settingsErr && settingsErr.code !== 'PGRST116') {
            // PGRST116 is "Result contains 0 rows" for single() depending on supabase version; still handle gracefully.
            console.warn('Settings fetch error:', settingsErr);
        }

        appSettings = settingsData || {
            conversion_rate: 0.05,
            min_withdraw_amount: 50,
            daily_task_limit: 10,
            anti_cheat_enabled: true,
            bot_username: 'MyBot_bot',
            referral_bonus: 50
        };

        // Load ad scripts safely (fail silently if not working)
        try {
            if (appSettings.monetag_interstitial_id) loadScript(appSettings.monetag_interstitial_id, (n) => adFuncs.interstitial = n);
            if (appSettings.monetag_rewarded_id) loadScript(appSettings.monetag_rewarded_id, (n) => adFuncs.rewarded = n);
            if (appSettings.monetag_popup_id) loadScript(appSettings.monetag_popup_id, (n) => adFuncs.popup = n);
        } catch (e) {
            console.warn('Ad load fail', e);
        }

        // User handling - if no user record, create one
        if (!userData) {
            const startParam = tg.initDataUnsafe?.start_param;
            let refId = (startParam && startParam != tgUser.id) ? parseInt(startParam) : null;

            if (appSettings.anti_cheat_enabled && refId && localStorage.getItem('device_ref_used')) {
                refId = null;
            }

            const { data: newUser, error: insertErr } = await supabase.from('users').insert([{
                id: tgUser.id,
                first_name: tgUser.first_name || 'User',
                username: tgUser.username || null,
                photo_url: tgUser.photo_url || null,
                referred_by: refId || null,
                balance: 0,
                referral_count: 0
            }]).select().single();

            if (insertErr) throw new Error('Registration Failed: ' + (insertErr.message || insertErr));

            currentUser = newUser;

            if (refId) {
                // Prefer doing sensitive updates (like awarding referral bonus) on server-side.
                // If you must call from client, ensure RPC is safe and doesn't expose service role.
                supabase.rpc('increment_referral', { referrer_id: refId }).then(() => {}).catch(e => console.warn('Referral RPC failed', e));
                localStorage.setItem('device_ref_used', 'true');
            }
        } else {
            currentUser = userData;
        }

        // Ensure default values
        currentUser.balance = Number(currentUser.balance || 0);
        currentUser.referral_count = Number(currentUser.referral_count || 0);
        updateUI();

        // Hide loader and show main app
        const loaderEl = document.getElementById('loading-screen');
        if (loaderEl) loaderEl.style.display = 'none';
        const mainApp = document.getElementById('main-app');
        if (mainApp) mainApp.classList.remove('hidden');
        router('home');

    } catch (err) {
        console.error(err);
        showError(err.message || String(err));
    }
}

// --- UTILS ---
function loadScript(zoneId, cb) {
    const s = document.createElement('script');
    s.src = '//libtl.com/sdk.js';
    const fname = 'show_' + zoneId;
    s.setAttribute('data-zone', zoneId);
    s.setAttribute('data-sdk', fname);
    s.onload = () => {
        // give SDK a tiny moment to register globals
        setTimeout(() => {
            cb(fname);
        }, 200);
    };
    s.onerror = (e) => console.warn('Ad script failed to load for zone', zoneId, e);
    document.head.appendChild(s);
}

function showError(msg) {
    const el = document.getElementById('error-msg');
    if (el) el.innerText = msg;
    const box = document.getElementById('error-box');
    if (box) box.classList.remove('hidden');
    const loader = document.querySelector('.loader');
    if (loader) loader.style.display = 'none';
}

function updateUI() {
    if (!currentUser) return;
    const uname = document.getElementById('user-name');
    const ubal = document.getElementById('user-balance');
    const uph = document.getElementById('user-photo');
    if (uname) uname.innerText = currentUser.first_name || 'User';
    if (ubal) ubal.innerText = Math.floor(Number(currentUser.balance || 0));
    if (uph && currentUser.photo_url) uph.src = currentUser.photo_url;
}

// --- ROUTER ---
function router(page) {
    document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.remove('active', 'text-[#FFD700]');
        b.classList.add('text-gray-500');
    });
    const btn = document.getElementById(`btn-${page}`);
    if (btn) btn.classList.add('active', 'text-[#FFD700]');

    const c = document.getElementById('main-app');
    if (!c) return;
    if (page === 'home') renderHome(c);
    else if (page === 'tasks') renderTasks(c);
    else if (page === 'wallet') renderWallet(c);
    else if (page === 'history') renderHistory(c);
    else if (page === 'refer') renderRefer(c);
}

// --- HOME PAGE ---
function renderHome(c) {
    if (!currentUser) return;
    const bdt = (Number(currentUser.balance || 0) * Number(appSettings.conversion_rate || 0)).toFixed(2);
    try {
        if (adFuncs.interstitial && window[adFuncs.interstitial]) {
            window[adFuncs.interstitial]({ type: 'inApp', inAppSettings: { frequency: 2, capping: 0.1, interval: 30, timeout: 5, everyPage: false } });
        }
    } catch (e) { console.warn('Interstitial error', e); }

    c.innerHTML = `
        <div class="glass-panel p-6 rounded-3xl text-center relative overflow-hidden mt-2 shadow-2xl border-t border-white/10">
            <div class="absolute -top-10 -left-10 w-40 h-40 bg-[#FFD700] rounded-full blur-[80px] opacity-20"></div>
            <p class="text-gray-400 text-xs uppercase tracking-[3px] mb-2 font-bold">Total Earnings</p>
            <h1 class="text-6xl font-bold text-white mb-2">${Math.floor(currentUser.balance)}</h1>
            <div class="inline-block bg-white/5 border border-white/10 rounded-full px-5 py-1.5 mt-1">
                <p class="text-xs text-[#FFD700] font-bold tracking-wide">≈ \u09F3 ${bdt} BDT</p>
            </div>
            <button onclick="router('tasks')" class="mt-8 w-full py-4 rounded-2xl gold-gradient text-black font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 uppercase tracking-wider">
                <i class="fas fa-play"></i> Start Earning
            </button>
        </div>
        
        <div class="grid grid-cols-2 gap-4 mt-6">
            <div class="glass-panel p-5 rounded-2xl flex flex-col items-center justify-center border border-white/5">
                <i class="fas fa-users text-3xl mb-2 text-blue-400"></i>
                <span class="text-2xl font-bold">${currentUser.referral_count || 0}</span>
                <span class="text-[10px] text-gray-400 uppercase mt-1">Refers</span>
            </div>
            <div class="glass-panel p-5 rounded-2xl flex flex-col items-center justify-center border border-white/5">
                <i class="fas fa-check-circle text-3xl mb-2 text-green-400"></i>
                <span class="text-2xl font-bold">Active</span>
                <span class="text-[10px] text-gray-400 uppercase mt-1">Status</span>
            </div>
        </div>
        ${appSettings.home_banner_url ? `<div class="mt-6 mb-4 rounded-2xl overflow-hidden shadow-lg border border-[#FFD700]/30 w-full h-40"><img src="${appSettings.home_banner_url}" class="w-full h-full object-cover"></div>` : ''}
    `;
}

// --- TASKS PAGE ---
async function renderTasks(c) {
    c.innerHTML = `<div class="flex justify-center mt-20"><div class="loader"></div></div>`;

    try {
        const { data: tasks, error: tasksErr } = await supabase.from('tasks').select('*').eq('is_active', true).order('id');

        if (tasksErr) {
            console.warn('Tasks fetch error', tasksErr);
            c.innerHTML = `<div class="text-red-400 text-sm mt-12 text-center">Failed to load tasks.</div>`;
            return;
        }

        // build date range for "today"
        const today = new Date();
        const startIso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString(); // midnight
        const nextDayIso = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

        // fetch task logs for today (range)
        const { data: logs, error: logsErr } = await supabase.from('task_logs')
            .select('task_id')
            .eq('user_id', currentUser.id)
            .gte('created_at', startIso)
            .lt('created_at', nextDayIso);

        if (logsErr) console.warn('Logs fetch error', logsErr);

        const counts = {};
        if (logs && Array.isArray(logs)) logs.forEach(l => {
            const id = l.task_id || (l.task && l.task.id) || null;
            if (id) counts[id] = (counts[id] || 0) + 1;
        });

        const locked = appSettings.referral_lock && (currentUser.referral_count < appSettings.min_referrals_req);
        const limit = appSettings.daily_task_limit || 10;

        let html = `
            <div class="flex justify-between items-center mb-5 mt-2 px-1">
                <h2 class="text-lg font-bold text-white">Task List</h2>
                <span class="text-[10px] bg-white/10 px-3 py-1 rounded-lg text-gray-300 border border-white/10">Limit: ${limit}</span>
            </div>
        `;

        if (locked) {
            html += `
                <div class="bg-red-500/10 border border-red-500/50 p-4 rounded-xl mb-6 text-center text-xs text-red-400">
                    <i class="fas fa-lock text-xl mb-2 block"></i>
                    Invite <b>${appSettings.min_referrals_req - currentUser.referral_count}</b> more friends to unlock.
                </div>`;
        }

        html += `<div class="space-y-4 pb-10">`;

        tasks.forEach(t => {
            let icon = 'star', btn = 'Claim', bCol = 'bg-gray-500/20';
            if (t.task_type === 'direct_ad') { icon = 'globe'; btn = 'Visit'; bCol = 'bg-blue-500/20 text-blue-400'; }
            else if (t.task_type === 'telegram') { icon = 'paper-plane'; btn = 'Join'; bCol = 'bg-cyan-500/20 text-cyan-400'; }
            else if (t.task_type === 'video') { icon = 'play-circle'; btn = 'Watch'; bCol = 'bg-purple-500/20 text-purple-400'; }

            const cnt = counts[t.id] || 0;
            const disabled = locked || cnt >= limit;
            const btnClass = disabled ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'gold-gradient text-black hover:opacity-90 active:scale-95';

            html += `
                <div class="glass-panel p-4 rounded-2xl flex justify-between items-center ${disabled?'opacity-60 grayscale':''}">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-[#FFD700] border border-white/10 shadow-lg"><i class="fas fa-${icon} text-xl"></i></div>
                        <div>
                            <h4 class="font-bold text-sm text-white line-clamp-1 mb-1">${escapeHtml(t.title || 'Untitled')}</h4>
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] ${bCol} px-1.5 py-0.5 rounded font-bold tracking-wider">TASK</span>
                                <span class="text-[10px] text-[#FFD700] font-bold border border-[#FFD700]/20 px-1.5 py-0.5 rounded">+${t.reward}</span>
                                <span class="text-[10px] text-gray-500 font-mono pl-2 border-l border-white/10">${cnt}/${limit}</span>
                            </div>
                        </div>
                    </div>
                    <button onclick="handleTask(${t.id}, ${t.reward}, '${t.task_type}', '${(t.link||'').replace(/'/g, "\\'")}')" 
                        ${disabled?'disabled':''} 
                        class="px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${btnClass}">
                        ${cnt >= limit ? 'Done' : btn}
                    </button>
                </div>`;
        });

        c.innerHTML = html + `</div>`;

    } catch (err) {
        console.error('renderTasks err', err);
        c.innerHTML = `<div class="text-red-400 text-sm mt-12 text-center">Something went wrong.</div>`;
    }
}

// helper to escape small html injection
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"'`=\/]/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c];
    });
}

// --- FIXED AD & TIMER LOGIC ---
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingTask) {
        const duration = Date.now() - adStartTime;

        if (duration >= MIN_AD_DURATION) {
            claimReward(pendingTask.id, pendingTask.reward);
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Too Fast!',
                text: `You must wait 10 seconds. You returned in ${(duration/1000).toFixed(1)}s`,
                confirmButtonColor: '#FFD700'
            });
        }
        // reset
        adStartTime = 0;
        pendingTask = null;
    }
});

window.handleTask = async (tid, rew, type, link) => {
    pendingTask = { id: tid, reward: rew };
    adStartTime = Date.now();

    try {
        if (type === 'direct_ad') {
            const url = (link && link !== 'null') ? link : appSettings.monetag_direct_link;
            if (url) {
                window.open(url, '_blank');
                // in background show interstitial if available
                setTimeout(() => {
                    try { if (adFuncs.interstitial && window[adFuncs.interstitial]) window[adFuncs.interstitial](); } catch(e){ }
                }, 1000);
            } else {
                Swal.fire('Error', 'No Link', 'error');
                pendingTask = null;
            }
        } else if (type === 'telegram') {
            if (link) window.open(link, '_blank');
            try { if (adFuncs.popup && window[adFuncs.popup]) window[adFuncs.popup]('pop'); } catch(e) {}
        } else if (type === 'video') {
            // rewarded ad may return a promise that resolves when ad finished
            if (adFuncs.rewarded && window[adFuncs.rewarded]) {
                try {
                    await window[adFuncs.rewarded]();
                    // if ad finished, claim directly
                    await claimReward(tid, rew);
                } catch (e) {
                    console.warn('Rewarded ad failed or closed', e);
                    Swal.fire('Info', 'Ad not completed', 'info');
                } finally {
                    adStartTime = 0;
                    pendingTask = null;
                }
            } else {
                // fallback: open link or reject
                if (link && link !== 'null') window.open(link, '_blank');
                Swal.fire('Info', 'No rewarded ad available', 'info');
            }
        } else {
            if (link && link !== 'null') window.open(link, '_blank');
            try { if (adFuncs.interstitial && window[adFuncs.interstitial]) window[adFuncs.interstitial](); } catch(e){}
        }
    } catch (err) {
        console.error('handleTask err', err);
        pendingTask = null;
    }
};

async function claimReward(tid, rew) {
    if (!currentUser) return Swal.fire('Error', 'User not found', 'error');
    Swal.showLoading();

    try {
        // SECURITY: Ideally this RPC should be called from your backend.
        // Example: await fetch('/api/claim-task', { method:'POST', body: JSON.stringify({ userId: currentUser.id, taskId: tid, reward: rew }) })
        const { data: res, error } = await supabase.rpc('claim_task', {
            p_user_id: currentUser.id,
            p_task_id: tid,
            p_reward: rew,
            p_limit: appSettings.daily_task_limit
        });

        Swal.close();

        if (error) {
            console.warn('claim_reward rpc error', error);
            return Swal.fire({ icon: 'error', title: 'Oops', text: error.message || 'Failed to claim' });
        }

        // res may be wrapped depending on rpc implementation
        const ok = (res && (res.success === true || res.success == 't')) || (res && res[0] && res[0].success);
        const message = (res && (res.message || (Array.isArray(res) && res[0] && res[0].message))) || null;

        if (ok) {
            currentUser.balance = Number(currentUser.balance || 0) + Number(rew || 0);
            updateUI();
            Swal.fire({ icon: 'success', title: `+${rew} Points`, toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
            router('tasks');
        } else {
            Swal.fire({ icon: 'error', title: 'Oops', text: message || 'Could not claim reward' });
        }

    } catch (err) {
        Swal.close();
        console.error('claimReward err', err);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message || String(err) });
    }
}

// --- SECURE WALLET ---
function renderWallet(c) {
    if (!currentUser) return;
    const bdt = (Number(currentUser.balance || 0) * Number(appSettings.conversion_rate || 0)).toFixed(2);
    c.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl text-center mb-6 mt-4 relative overflow-hidden shadow-2xl">
            <div class="absolute -right-10 -top-10 w-32 h-32 bg-green-500/20 rounded-full blur-[60px]"></div>
            <p class="text-gray-400 text-xs font-bold uppercase tracking-widest">Available Funds</p>
            <h1 class="text-5xl font-bold gold-text my-3">\u09F3 ${bdt}</h1>
            <div class="inline-block bg-white/5 px-4 py-1.5 rounded-full border border-white/10"><p class="text-[10px] text-gray-400">Min: \u09F3 ${appSettings.min_withdraw_amount}</p></div>
        </div>
        <div class="space-y-6">
            <div><label class="text-xs text-gray-400 ml-1 font-bold uppercase">Method</label><div class="mt-2 glass-panel p-4 rounded-xl border border-[#FFD700] flex items-center justify-between bg-[#FFD700]/5"><div class="flex items-center gap-3"><img src="https://freelogopng.com/images/all_img/1656234745bkash-app-logo-png.png" class="h-8 object-contain"><span class="font-bold text-sm text-white">Bkash Personal</span></div><i class="fas fa-check-circle text-[#FFD700] text-xl"></i></div></div>
            <div class="space-y-3">
                <div><label class="text-xs text-gray-400 ml-1 font-bold">Number</label><input type="text" id="w-num" placeholder="017xxxxxxxx" class="custom-input"></div>
                <div><label class="text-xs text-gray-400 ml-1 font-bold">Amount</label><input type="number" id="w-amt" placeholder="Min ${appSettings.min_withdraw_amount}" class="custom-input"></div>
            </div>
            <button id="w-btn" onclick="processWithdraw()" class="w-full py-4 rounded-xl gold-gradient text-black font-bold mt-4 shadow-lg active:scale-95 transition-transform text-sm uppercase tracking-wide flex items-center justify-center gap-2">Submit Request</button>
        </div>`;
}

async function processWithdraw() {
    const btn = document.getElementById('w-btn');
    const num = document.getElementById('w-num')?.value;
    const amt = parseInt(document.getElementById('w-amt')?.value || 0, 10);

    if (!num || !amt) return Swal.fire('Error', 'Fill all fields', 'warning');
    if (amt < appSettings.min_withdraw_amount) return Swal.fire('Error', `Min \u09F3${appSettings.min_withdraw_amount}`, 'warning');

    const pts = amt / (appSettings.conversion_rate || 1);
    if (Number(currentUser.balance || 0) < pts) return Swal.fire('Error', 'Low Balance', 'error');

    btn.disabled = true;
    const prevText = btn.innerText;
    btn.innerText = "Processing...";

    try {
        // SECURITY: prefer server-side withdraw processing. Example: POST /api/withdraw
        const { data: res, error } = await supabase.rpc('process_withdrawal', {
            p_user_id: currentUser.id,
            p_method: 'Bkash',
            p_number: num,
            p_amount_bdt: amt,
            p_points_needed: pts
        });

        if (error) {
            console.warn('withdraw rpc error', error);
            Swal.fire('Error', error.message || 'Failed', 'error');
            btn.disabled = false;
            btn.innerText = prevText;
            return;
        }

        const ok = (res && (res.success === true || res.success == 't')) || (res && res[0] && res[0].success);
        if (ok) {
            currentUser.balance = Number(currentUser.balance || 0) - Number(pts || 0);
            updateUI();
            Swal.fire('Success', 'Request Sent!', 'success');
            router('history');
        } else {
            Swal.fire('Error', res?.message || 'Failed', 'error');
            btn.disabled = false;
            btn.innerText = prevText;
        }
    } catch (err) {
        console.error('processWithdraw err', err);
        Swal.fire('Error', err.message || 'Failed', 'error');
        btn.disabled = false;
        btn.innerText = prevText;
    }
}

// --- HISTORY PAGE ---
async function renderHistory(c) {
    c.innerHTML = `<div class="w-full h-full flex justify-center items-center mt-20"><div class="loader"></div></div>`;
    try {
        const { data: w, error } = await supabase.from('withdrawals').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        let html = `<div class="my-4 px-1"><h2 class="text-lg font-bold mb-4 ml-1 text-white flex items-center gap-2"><i class="fas fa-history text-[#FFD700]"></i> Transaction History</h2>`;

        if (error) {
            console.warn('history fetch err', error);
            html += `<div class="text-center text-gray-500 text-sm mt-20">Failed to load history.</div>`;
        } else if (!w || w.length === 0) {
            html += `<div class="text-center text-gray-500 text-sm mt-20">No transactions found.</div>`;
        } else {
            html += `<div class="space-y-3 pb-20">`;
            w.forEach(i => {
                let col = i.status === 'paid' ? 'text-green-400' : (i.status === 'rejected' ? 'text-red-400' : 'text-yellow-400');
                html += `
                    <div class="glass-panel p-4 rounded-xl flex justify-between items-center border-l-4 ${i.status==='paid'?'border-green-500/50':'border-yellow-500/50'}">
                        <div class="flex items-center gap-4">
                            <div><h4 class="font-bold text-sm text-white">\u09F3 ${i.amount_bdt}</h4><p class="text-[10px] text-gray-400 font-mono">${new Date(i.created_at).toLocaleDateString()}</p></div>
                        </div>
                        <span class="text-[10px] font-bold ${col} uppercase bg-white/5 px-2 py-1 rounded border border-white/5">${i.status}</span>
                    </div>`;
            });
            html += `</div>`;
        }
        c.innerHTML = html;
    } catch (err) {
        console.error('renderHistory err', err);
        c.innerHTML = `<div class="text-red-400 text-sm mt-12 text-center">Could not load history.</div>`;
    }
}

// --- REFER PAGE ---
function renderRefer(c) {
    const link = `https://t.me/${appSettings.bot_username || 'MyBot_bot'}?start=${currentUser.id}`;
    const showInput = currentUser.referred_by === null || currentUser.referred_by === undefined;
    const bonus = appSettings.referral_bonus || 50;

    c.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl text-center mt-4 border border-[#FFD700]/30 shadow-2xl">
            <h2 class="text-2xl font-bold text-white">Invite & Earn</h2>
            <p class="text-xs text-gray-400 mt-2 px-4">Get <b class="text-[#FFD700]">${bonus} points</b> per referral!</p>
        </div>
        <div class="glass-panel p-3 rounded-xl mt-6 flex items-center gap-3 bg-black/30 border border-white/10">
            <input type="text" value="${link}" readonly class="bg-transparent text-xs w-full text-gray-300 outline-none font-mono" id="ref-link">
            <button onclick="copyLink()" class="p-2.5 bg-[#FFD700] rounded-lg text-black font-bold text-xs"><i class="fas fa-copy"></i></button>
        </div>
        
        ${showInput ? `
        <div class="glass-panel p-5 rounded-xl mt-5 border border-[#FFD700]/20 bg-[#FFD700]/5">
            <p class="text-xs text-gray-300 mb-3 font-bold">Enter Referral Code</p>
            <div class="flex gap-2">
                <input type="number" id="ref-code-input" placeholder="ID" class="custom-input">
                <button onclick="submitRef()" class="gold-gradient text-black text-xs font-bold px-6 py-2 rounded-lg">Apply</button>
            </div>
        </div>` : ''}
        
        <div class="mt-6 glass-panel p-5 rounded-xl flex justify-between items-center shadow-lg border border-white/5">
            <div><p class="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Total Referrals</p><h4 class="text-3xl font-bold text-white">${currentUser.referral_count}</h4></div>
            <div class="text-right"><p class="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Bonus Earned</p><h4 class="text-3xl font-bold text-[#FFD700]">${currentUser.referral_count * bonus}</h4></div>
        </div>`;
}

async function submitRef() {
    const code = document.getElementById('ref-code-input')?.value;
    if (!code) return Swal.fire('Error', 'Enter Code', 'warning');

    if (appSettings.anti_cheat_enabled && localStorage.getItem('device_ref_used')) {
        return Swal.fire('Blocked', 'Device used!', 'error');
    }

    Swal.showLoading();
    try {
        // Ideally do this on server-side for security
        const { data: res, error } = await supabase.rpc('submit_referral_code', {
            p_user_id: currentUser.id,
            p_referrer_id: parseInt(code, 10)
        });
        Swal.close();

        if (error) {
            console.warn('submitRef rpc error', error);
            return Swal.fire('Error', error.message || 'Invalid Code', 'error');
        }

        const ok = (res && (res.success === true || res.success == 't')) || (res && res[0] && res[0].success);
        if (ok) {
            if (appSettings.anti_cheat_enabled) localStorage.setItem('device_ref_used', 'true');
            currentUser.referred_by = parseInt(code, 10);
            Swal.fire('Success', 'Applied!', 'success');
            router('refer');
        } else {
            Swal.fire('Error', res?.message || 'Invalid Code', 'error');
        }
    } catch (err) {
        Swal.close();
        console.error('submitRef err', err);
        Swal.fire('Error', err.message || 'Failed', 'error');
    }
}

window.copyLink = () => {
    const copyText = document.getElementById("ref-link");
    if (!copyText) return;
    copyText.select();
    try {
        document.execCommand("copy");
        Swal.fire({ icon: 'success', title: 'Copied!', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    } catch (e) {
        Swal.fire('Error', 'Copy failed', 'error');
    }
};

// START APP
initApp();
