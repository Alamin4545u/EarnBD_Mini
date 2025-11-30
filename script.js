// ============================================================
// 1. CONFIGURATION & STATE
// ============================================================
const SUPABASE_URL = 'https://wnmwvbeydsrehtsnkfoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubXd2YmV5ZHNyZWh0c25rZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDg4MzIsImV4cCI6MjA3OTg4NDgzMn0.4vSObxBEr8r11-dqkp9y6bVroMVoSTEnIOTF8Vo8sxk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;

let currentUser = null;
let appSettings = {};
let adFuncs = { interstitial: null, rewarded: null, popup: null };

// টাইমার এবং সিকিউরিটি ভেরিয়েবল
let adStartTime = 0;
let pendingTask = null;
const MIN_AD_DURATION = 10000; // ১০ সেকেন্ড

// ============================================================
// 2. APP INITIALIZATION
// ============================================================
async function initApp() {
    tg.expand();
    tg.setHeaderColor('#0f0f0f');
    
    const tgUser = tg.initDataUnsafe?.user;

    // টেলিগ্রাম চেক (ব্রাউজারে টেস্ট করতে চাইলে নিচের লাইন আনকমেন্ট করুন)
    // const tgUser = { id: 12345, first_name: "Tester", username: "user", photo_url: "" };

    if (!tgUser) {
        showError("Please open inside Telegram.");
        return;
    }

    try {
        // ১. সেটিংস লোড
        const { data: sData, error: sError } = await supabase.from('settings').select('*').single();
        appSettings = sData || { 
            conversion_rate: 0.05, min_withdraw_amount: 50, daily_task_limit: 10, 
            anti_cheat_enabled: true, bot_username: 'MyBot_bot', referral_bonus: 50 
        };

        // ২. Monetag স্ক্রিপ্ট লোড (Dynamic)
        if (appSettings.monetag_interstitial_id) loadScript(appSettings.monetag_interstitial_id, (n) => adFuncs.interstitial = n);
        if (appSettings.monetag_rewarded_id) loadScript(appSettings.monetag_rewarded_id, (n) => adFuncs.rewarded = n);
        if (appSettings.monetag_popup_id) loadScript(appSettings.monetag_popup_id, (n) => adFuncs.popup = n);

        // ৩. ইউজার চেক
        let { data: user } = await supabase.from('users').select('*').eq('id', tgUser.id).single();

        if (!user) {
            const startParam = tg.initDataUnsafe?.start_param;
            let refId = (startParam && startParam != tgUser.id) ? parseInt(startParam) : null;
            
            // Anti-Cheat চেক
            if (appSettings.anti_cheat_enabled && refId && localStorage.getItem('device_ref_used')) {
                refId = null;
            }

            const { data: newUser, error: cError } = await supabase.from('users').insert([{
                id: tgUser.id, first_name: tgUser.first_name || 'User', username: tgUser.username,
                photo_url: tgUser.photo_url, referred_by: refId, balance: 0
            }]).select().single();

            if (cError) throw new Error("Registration Failed");
            user = newUser;

            if (refId) {
                await supabase.rpc('increment_referral', { referrer_id: refId });
                localStorage.setItem('device_ref_used', 'true');
            }
        }

        currentUser = user;
        updateUI();
        
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            router('home');
        }, 1000);

    } catch (err) {
        showError(err.message);
    }
}

// ============================================================
// 3. HELPER FUNCTIONS
// ============================================================
function loadScript(zoneId, cb) {
    const s = document.createElement('script');
    s.src = '//libtl.com/sdk.js';
    const fname = 'show_' + zoneId;
    s.setAttribute('data-zone', zoneId);
    s.setAttribute('data-sdk', fname);
    s.onload = () => cb(fname);
    document.head.appendChild(s);
}

function showError(msg) {
    document.getElementById('error-msg').innerText = msg;
    document.getElementById('error-box').classList.remove('hidden');
    document.querySelector('.loader').style.display = 'none';
}

function updateUI() {
    if(!currentUser) return;
    document.getElementById('user-name').innerText = currentUser.first_name;
    document.getElementById('user-balance').innerText = Math.floor(currentUser.balance);
    if(currentUser.photo_url) document.getElementById('user-photo').src = currentUser.photo_url;
}

// ============================================================
// 4. ROUTING SYSTEM
// ============================================================
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

// ============================================================
// 5. HOME PAGE
// ============================================================
function renderHome(c) {
    const bdt = (currentUser.balance * appSettings.conversion_rate).toFixed(2);
    
    if(adFuncs.interstitial && window[adFuncs.interstitial]) {
        window[adFuncs.interstitial]({ type: 'inApp', inAppSettings: { frequency: 2, capping: 0.1, interval: 30, timeout: 5, everyPage: false } });
    }

    c.innerHTML = `
        <div class="glass-panel p-6 rounded-3xl text-center relative overflow-hidden mt-2 shadow-2xl border-t border-white/10">
            <div class="absolute -top-10 -left-10 w-40 h-40 bg-[#FFD700] rounded-full blur-[80px] opacity-20"></div>
            <p class="text-gray-400 text-xs uppercase tracking-[3px] mb-2 font-bold">Total Earnings</p>
            <h1 class="text-6xl font-bold text-white mb-2">${currentUser.balance}</h1>
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
                <span class="text-2xl font-bold">${currentUser.referral_count}</span>
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

// ============================================================
// 6. TASKS PAGE
// ============================================================
async function renderTasks(c) {
    c.innerHTML = `<div class="flex justify-center mt-20"><div class="loader"></div></div>`;
    
    const { data: tasks } = await supabase.from('tasks').select('*').eq('is_active', true).order('id');
    const today = new Date().toISOString().split('T')[0];
    const { data: logs } = await supabase.from('task_logs').select('task_id').eq('user_id', currentUser.id).eq('created_at', today);

    const counts = {};
    if (logs) logs.forEach(l => counts[l.task_id] = (counts[l.task_id] || 0) + 1);
    
    const locked = appSettings.referral_lock && (currentUser.referral_count < appSettings.min_referrals_req);
    const limit = appSettings.daily_task_limit || 10;

    let html = `
        <div class="flex justify-between items-center mb-5 mt-2 px-1">
            <h2 class="text-lg font-bold text-white">Task List</h2>
            <span class="text-[10px] bg-white/10 px-3 py-1 rounded-lg text-gray-300 border border-white/10">Limit: ${limit}</span>
        </div>
    `;

    if (locked) {
        html += `<div class="bg-red-500/10 border border-red-500/50 p-4 rounded-xl mb-6 text-center text-xs text-red-400"><i class="fas fa-lock text-xl mb-2 block"></i>Invite <b>${appSettings.min_referrals_req - currentUser.referral_count}</b> more friends to unlock.</div>`;
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
                        <h4 class="font-bold text-sm text-white line-clamp-1 mb-1">${t.title}</h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[9px] ${bCol} px-1.5 py-0.5 rounded font-bold tracking-wider">TASK</span>
                            <span class="text-[10px] text-[#FFD700] font-bold border border-[#FFD700]/20 px-1.5 py-0.5 rounded">+${t.reward}</span>
                            <span class="text-[10px] text-gray-500 font-mono pl-2 border-l border-white/10">${cnt}/${limit}</span>
                        </div>
                    </div>
                </div>
                <button onclick="handleTask(${t.id}, ${t.reward}, '${t.task_type}', '${t.link || ''}')" 
                    ${disabled?'disabled':''} 
                    class="px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${btnClass}">
                    ${cnt >= limit ? 'Done' : btn}
                </button>
            </div>`;
    });
    c.innerHTML = html + `</div>`;
}

// ============================================================
// 7. AD & TIMER LOGIC
// ============================================================
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && adStartTime > 0 && pendingTask) {
        const duration = Date.now() - adStartTime;
        if (duration >= MIN_AD_DURATION) {
            claimReward(pendingTask.id, pendingTask.reward);
        } else {
            Swal.fire({ icon: 'warning', title: 'Too Fast!', text: `Wait 10s. Returned in ${(duration/1000).toFixed(1)}s`, confirmButtonColor: '#FFD700' });
        }
        adStartTime = 0; pendingTask = null;
    }
});

window.handleTask = async (tid, rew, type, link) => {
    pendingTask = { id: tid, reward: rew };
    adStartTime = Date.now();

    if (type === 'direct_ad') {
        const url = (link && link !== 'null') ? link : appSettings.monetag_direct_link;
        if(url) { 
            window.open(url, '_blank'); 
            setTimeout(() => { if(adFuncs.interstitial && window[adFuncs.interstitial]) window[adFuncs.interstitial](); }, 1000); 
        } else {
            Swal.fire('Error', 'No Link', 'error');
        }
    } 
    else if (type === 'telegram') {
        if(link) window.open(link, '_blank');
        if(adFuncs.popup && window[adFuncs.popup]) window[adFuncs.popup]('pop');
    } 
    else if (type === 'video') {
        if(adFuncs.rewarded && window[adFuncs.rewarded]) {
            window[adFuncs.rewarded]().then(() => { 
                claimReward(tid, rew); 
                adStartTime = 0; 
                pendingTask = null; 
            });
        }
    } 
    else {
        if(link && link !== 'null') window.open(link, '_blank');
        if(adFuncs.interstitial && window[adFuncs.interstitial]) window[adFuncs.interstitial]();
    }
};

async function claimReward(tid, rew) {
    Swal.showLoading();
    const { data: res } = await supabase.rpc('claim_task', { 
        p_user_id: currentUser.id, 
        p_task_id: tid, 
        p_reward: rew, 
        p_limit: appSettings.daily_task_limit 
    });
    Swal.close();
    
    if (res && res.success) {
        currentUser.balance += rew; updateUI();
        Swal.fire({ icon: 'success', title: `+${rew} Points`, toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        router('tasks');
    } else {
        Swal.fire({ icon: 'error', title: 'Oops', text: res?.message });
    }
}

// ============================================================
// 8. WALLET PAGE (SECURE)
// ============================================================
function renderWallet(c) {
    const bdt = (currentUser.balance * appSettings.conversion_rate).toFixed(2);
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
                <div><label class="text-xs text-gray-400 ml-1 font-bold">Number</label><input type="number" id="w-num" placeholder="017xxxxxxxx" class="custom-input"></div>
                <div><label class="text-xs text-gray-400 ml-1 font-bold">Amount</label><input type="number" id="w-amt" placeholder="Min ${appSettings.min_withdraw_amount}" class="custom-input"></div>
            </div>
            <button id="w-btn" onclick="processWithdraw()" class="w-full py-4 rounded-xl gold-gradient text-black font-bold mt-4 shadow-lg active:scale-95 transition-transform text-sm uppercase tracking-wide flex items-center justify-center gap-2">Submit Request</button>
        </div>`;
}

async function processWithdraw() {
    const btn = document.getElementById('w-btn');
    const num = document.getElementById('w-num').value;
    const amt = parseInt(document.getElementById('w-amt').value);
    
    if (!num || !amt) return Swal.fire('Error', 'Fill all fields', 'warning');
    if (amt < appSettings.min_withdraw_amount) return Swal.fire('Error', `Min \u09F3${appSettings.min_withdraw_amount}`, 'warning');
    const pts = amt / appSettings.conversion_rate;
    if (currentUser.balance < pts) return Swal.fire('Error', 'Low Balance', 'error');

    btn.disabled = true; btn.innerText = "Processing...";
    if(adFuncs.interstitial && window[adFuncs.interstitial]) await window[adFuncs.interstitial]().catch(()=>{});

    const { data: res } = await supabase.rpc('process_withdrawal', { 
        p_user_id: currentUser.id, 
        p_method: 'Bkash', 
        p_number: num, 
        p_amount_bdt: amt, 
        p_points_needed: pts 
    });

    if (res && res.success) {
        currentUser.balance -= pts; updateUI();
        Swal.fire('Success', 'Request Sent!', 'success'); router('history');
    } else {
        Swal.fire('Error', res?.message || 'Failed', 'error');
        btn.disabled = false; btn.innerText = "Submit Request";
    }
}

// ============================================================
// 9. HISTORY PAGE
// ============================================================
async function renderHistory(c) {
    c.innerHTML = `<div class="w-full h-full flex justify-center items-center mt-20"><div class="loader"></div></div>`;
    const { data: w } = await supabase.from('withdrawals').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    let html = `<div class="my-4 px-1"><h2 class="text-lg font-bold mb-4 ml-1 text-white flex items-center gap-2"><i class="fas fa-history text-[#FFD700]"></i> Transaction History</h2>`;
    if (!w || w.length === 0) html += `<div class="text-center text-gray-500 text-sm mt-20">No transactions found.</div>`;
    else {
        html += `<div class="space-y-3 pb-20">`;
        w.forEach(i => {
            let col = i.status==='paid'?'text-green-400':(i.status==='rejected'?'text-red-400':'text-yellow-400');
            html += `<div class="glass-panel p-4 rounded-xl flex justify-between items-center border-l-4 ${i.status==='paid'?'border-green-500/50':'border-yellow-500/50'}"><div class="flex items-center gap-4"><div><h4 class="font-bold text-sm text-white">\u09F3 ${i.amount_bdt}</h4><p class="text-[10px] text-gray-400 font-mono">${new Date(i.created_at).toLocaleDateString()}</p></div></div><span class="text-[10px] font-bold ${col} uppercase bg-white/5 px-2 py-1 rounded border border-white/5">${i.status}</span></div>`;
        });
        html += `</div>`;
    }
    c.innerHTML = html;
}

// ============================================================
// 10. REFER PAGE
// ============================================================
function renderRefer(c) {
    const link = `https://t.me/${appSettings.bot_username || 'MyBot_bot'}?start=${currentUser.id}`;
    const showInput = currentUser.referred_by === null;
    const bonus = appSettings.referral_bonus || 50;
    c.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl text-center mt-4 border border-[#FFD700]/30 shadow-2xl">
            <h2 class="text-2xl font-bold text-white">Invite & Earn</h2>
            <p class="text-xs text-gray-400 mt-2 px-4">Get <b class="text-[#FFD700]">${bonus} points</b> per referral!</p>
        </div>
        <div class="glass-panel p-3 rounded-xl mt-6 flex items-center gap-3 bg-black/30 border border-white/10"><input type="text" value="${link}" readonly class="bg-transparent text-xs w-full text-gray-300 outline-none font-mono" id="ref-link"><button onclick="copyLink()" class="p-2.5 bg-[#FFD700] rounded-lg text-black font-bold text-xs"><i class="fas fa-copy"></i></button></div>
        ${showInput ? `<div class="glass-panel p-5 rounded-xl mt-5 border border-[#FFD700]/20 bg-[#FFD700]/5"><p class="text-xs text-gray-300 mb-3 font-bold">Enter Referral Code</p><div class="flex gap-2"><input type="number" id="ref-code-input" placeholder="ID" class="custom-input"><button onclick="submitRef()" class="gold-gradient text-black text-xs font-bold px-6 py-2 rounded-lg">Apply</button></div></div>` : ''}
        <div class="mt-6 glass-panel p-5 rounded-xl flex justify-between items-center shadow-lg border border-white/5"><div><p class="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Total Referrals</p><h4 class="text-3xl font-bold text-white">${currentUser.referral_count}</h4></div><div class="text-right"><p class="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Bonus Earned</p><h4 class="text-3xl font-bold text-[#FFD700]">${currentUser.referral_count * bonus}</h4></div></div>`;
}

async function submitRef() {
    const code = document.getElementById('ref-code-input').value;
    if(!code) return Swal.fire('Error', 'Enter Code', 'warning');
    if(appSettings.anti_cheat_enabled && localStorage.getItem('device_ref_used')) return Swal.fire('Blocked', 'Device used!', 'error');
    
    Swal.showLoading();
    const { data: res } = await supabase.rpc('submit_referral_code', { p_user_id: currentUser.id, p_referrer_id: parseInt(code) });
    Swal.close();
    if(res && res.success) {
        if(appSettings.anti_cheat_enabled) localStorage.setItem('device_ref_used', 'true');
        currentUser.referred_by = parseInt(code); Swal.fire('Success', 'Applied!', 'success'); router('refer');
    } else Swal.fire('Error', res?.message || 'Invalid Code', 'error');
}

window.copyLink = () => { document.getElementById("ref-link").select(); document.execCommand("copy"); Swal.fire({ icon: 'success', title: 'Copied!', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 }); };

initApp();
