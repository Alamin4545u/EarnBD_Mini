// CONFIG
const SUPABASE_URL = 'https://wnmwvbeydsrehtsnkfoc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubXd2YmV5ZHNyZWh0c25rZm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDg4MzIsImV4cCI6MjA3OTg4NDgzMn0.4vSObxBEr8r11-dqkp9y6bVroMVoSTEnIOTF8Vo8sxk';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;

let user = null, settings = {}, adFuncs = {}, adStart = 0, pending = null;
const MIN_AD_DURATION = 10000; // 10s

async function init() {
    tg.expand(); tg.setHeaderColor('#0f0f0f');
    const u = tg.initDataUnsafe?.user; 
    if(!u) return document.getElementById('err-msg').innerText = "Open in Telegram", document.getElementById('err-msg').classList.remove('hidden');

    const { data: s } = await sb.from('settings').select('*').single();
    settings = s || { conversion_rate: 0.05, min_withdraw_amount: 50, daily_task_limit: 10, bot_username: 'bot', referral_bonus: 50 };

    if(settings.monetag_interstitial_id) loadScr(settings.monetag_interstitial_id, 'interstitial');
    if(settings.monetag_rewarded_id) loadScr(settings.monetag_rewarded_id, 'rewarded');
    if(settings.monetag_popup_id) loadScr(settings.monetag_popup_id, 'popup');

    let { data: dbUser } = await sb.from('users').select('*').eq('id', u.id).single();
    if(!dbUser) {
        const refParam = tg.initDataUnsafe?.start_param;
        let refId = (refParam && refParam != u.id) ? parseInt(refParam) : null;
        if(settings.anti_cheat_enabled && localStorage.getItem('dev_ref')) refId = null;
        
        const { data: newUser, error } = await sb.from('users').insert([{
            id: u.id, first_name: u.first_name, username: u.username, photo_url: u.photo_url, referred_by: refId
        }]).select().single();
        
        if(error) return alert("Login Error");
        dbUser = newUser;
        if(refId) { await sb.rpc('increment_referral', { p_referrer_id: refId }); localStorage.setItem('dev_ref', '1'); }
    }
    user = dbUser;
    updateUI();
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    route('home');
}

function loadScr(id, type) {
    const s = document.createElement('script'); s.src = '//libtl.com/sdk.js';
    s.setAttribute('data-zone', id); s.setAttribute('data-sdk', 'show_'+id);
    s.onload = () => adFuncs[type] = 'show_'+id;
    document.head.appendChild(s);
}

function updateUI() {
    if(!user) return;
    document.getElementById('u-name').innerText = user.first_name;
    document.getElementById('u-bal').innerText = Math.floor(user.balance);
    document.getElementById('u-img').src = user.photo_url || "https://ui-avatars.com/api/?name="+user.first_name;
}

function route(p) {
    document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active','text-[#FFD700]'));
    document.getElementById('btn-'+p).classList.add('active','text-[#FFD700]');
    const c = document.getElementById('main-app');
    if(p=='home') renderHome(c);
    else if(p=='tasks') renderTasks(c);
    else if(p=='wallet') renderWallet(c);
    else if(p=='history') renderHistory(c);
    else if(p=='refer') renderRefer(c);
}

function renderHome(c) {
    if(adFuncs.interstitial && window[adFuncs.interstitial]) window[adFuncs.interstitial]({type:'inApp', inAppSettings:{frequency:2,capping:0.1,interval:30,timeout:5,everyPage:false}});
    const bdt = (user.balance * settings.conversion_rate).toFixed(2);
    c.innerHTML = `
        <div class="glass p-6 rounded-3xl text-center mt-4 border border-white/10">
            <p class="text-xs text-gray-400 font-bold">EARNINGS</p>
            <h1 class="text-5xl font-bold gold-text my-2">${user.balance}</h1>
            <div class="bg-white/5 inline-block px-4 py-1 rounded-full text-xs">≈ \u09F3 ${bdt}</div>
            <button onclick="route('tasks')" class="mt-6 w-full py-3 rounded-xl gold-gradient text-black font-bold shadow-lg active:scale-95">START EARNING</button>
        </div>
        ${settings.home_banner_url ? `<img src="${settings.home_banner_url}" class="mt-6 w-full h-40 object-cover rounded-xl border border-white/10">` : ''}
    `;
}

async function renderTasks(c) {
    c.innerHTML = `<div class="flex justify-center mt-20"><div class="loader"></div></div>`;
    const { data: tasks } = await sb.from('tasks').select('*').eq('is_active', true).order('id');
    const { data: logs } = await sb.from('task_logs').select('task_id').eq('user_id', user.id).eq('created_at', new Date().toISOString().split('T')[0]);
    
    const counts = {}; if(logs) logs.forEach(l => counts[l.task_id] = (counts[l.task_id] || 0) + 1);
    const locked = settings.referral_lock && (user.referral_count < settings.min_referrals_req);
    
    let h = `<div class="flex justify-between mb-4 mt-2"><h2 class="font-bold">Tasks</h2><span class="text-xs bg-white/10 px-2 py-1 rounded">Daily Limit: ${settings.daily_task_limit}</span></div>`;
    if(locked) h+= `<div class="bg-red-900/20 border border-red-500 p-3 rounded-xl text-center text-xs text-red-400 mb-4">Invite ${settings.min_referrals_req - user.referral_count} more friends to unlock.</div>`;
    
    h+= `<div class="space-y-3 pb-24">`;
    tasks.forEach(t => {
        const cnt = counts[t.id] || 0;
        const dis = locked || cnt >= settings.daily_task_limit;
        h+= `<div class="glass p-4 rounded-xl flex justify-between items-center ${dis?'opacity-50 grayscale':''}">
            <div><h4 class="font-bold text-sm">${t.title}</h4><span class="text-xs text-[#FFD700]">+${t.reward} Pts</span> <span class="text-[10px] text-gray-500 ml-2">${cnt}/${settings.daily_task_limit}</span></div>
            <button onclick="doTask(${t.id}, ${t.reward}, '${t.task_type}', '${t.link}')" ${dis?'disabled':''} class="gold-gradient text-black px-4 py-1.5 rounded-lg text-xs font-bold">Go</button>
        </div>`;
    });
    c.innerHTML = h + `</div>`;
}

document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible" && adStart > 0 && pending) {
        const diff = Date.now() - adStart;
        if(diff >= 10000) claim(pending.id, pending.rew);
        else Swal.fire({icon:'warning', title:'Too Fast', text:`Wait 10s. Returned in ${(diff/1000).toFixed(1)}s`, confirmButtonColor:'#FFD700'});
        adStart = 0; pending = null;
    }
});

window.doTask = async (id, rew, type, link) => {
    pending = { id, rew }; adStart = Date.now();
    if(type === 'direct_ad' || type === 'web') {
        const url = link && link!='null' ? link : settings.monetag_direct_link;
        window.open(url, '_blank');
        setTimeout(() => { if(adFuncs.interstitial && window[adFuncs.interstitial]) window[adFuncs.interstitial](); }, 1000);
    } else if(type === 'telegram') {
        window.open(link, '_blank');
        if(adFuncs.popup && window[adFuncs.popup]) window[adFuncs.popup]('pop');
    } else if(type === 'video') {
        if(adFuncs.rewarded && window[adFuncs.rewarded]) window[adFuncs.rewarded]().then(() => { claim(id, rew); adStart=0; }).catch(()=>{});
        else adStart = Date.now(); 
    }
};

async function claim(tid, rew) {
    Swal.showLoading();
    const { data: res } = await sb.rpc('claim_task', { p_user_id: user.id, p_task_id: tid, p_reward: rew, p_limit: settings.daily_task_limit });
    Swal.close();
    if(res && res.success) {
        user.balance += rew; updateUI();
        Swal.fire({icon:'success', title:`+${rew}`, toast:true, position:'top-end', showConfirmButton:false, timer:1500});
        route('tasks');
    } else Swal.fire({icon:'error', title:'Oops', text:res?.message});
}

function renderWallet(c) {
    const bdt = (user.balance * settings.conversion_rate).toFixed(2);
    c.innerHTML = `
        <div class="glass p-6 rounded-3xl text-center mt-4 border border-white/10 mb-6">
            <p class="text-xs text-gray-400 font-bold">FUNDS</p>
            <h1 class="text-4xl font-bold gold-text my-2">\u09F3 ${bdt}</h1>
            <p class="text-[10px]">Min: \u09F3 ${settings.min_withdraw_amount}</p>
        </div>
        <div class="space-y-4">
            <div class="glass p-3 rounded-xl border border-[#FFD700] flex items-center gap-3"><img src="https://freelogopng.com/images/all_img/1656234745bkash-app-logo-png.png" class="h-6"><span class="font-bold text-sm">Bkash</span></div>
            <input type="number" id="w-num" placeholder="017xxxxxxxx" class="custom-input">
            <input type="number" id="w-amt" placeholder="Amount" class="custom-input">
            <button id="w-btn" onclick="withdraw()" class="w-full gold-gradient py-3 rounded-xl text-black font-bold">Withdraw</button>
        </div>`;
}

async function withdraw() {
    const btn = document.getElementById('w-btn');
    const num = document.getElementById('w-num').value;
    const amt = parseInt(document.getElementById('w-amt').value);
    
    if(!num || !amt) return Swal.fire('Error','Fill fields','warning');
    if(amt < settings.min_withdraw_amount) return Swal.fire('Error', `Min \u09F3${settings.min_withdraw_amount}`, 'warning');
    const pts = amt / settings.conversion_rate;
    
    btn.disabled = true; btn.innerText = "Processing...";
    if(adFuncs.interstitial && window[adFuncs.interstitial]) await window[adFuncs.interstitial]().catch(()=>{});

    const { data: res } = await sb.rpc('process_withdrawal', { 
        p_user_id: user.id, p_method: 'Bkash', p_number: num, p_amount_bdt: amt, p_points_needed: pts 
    });

    if(res && res.success) {
        user.balance -= pts; updateUI();
        Swal.fire('Success', 'Request Sent!', 'success'); route('history');
    } else {
        Swal.fire('Error', res?.message || 'Failed', 'error');
        btn.disabled = false; btn.innerText = "Withdraw";
    }
}

async function renderHistory(c) {
    c.innerHTML = `<div class="flex justify-center mt-20"><div class="loader"></div></div>`;
    const { data: w } = await sb.from('withdrawals').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    let h = `<h2 class="font-bold mb-4 mt-2">History</h2><div class="space-y-3 pb-20">`;
    if(!w.length) h += `<div class="text-center text-gray-500 text-sm">No History</div>`;
    else w.forEach(i => {
        let col = i.status=='paid'?'text-green-400':(i.status=='rejected'?'text-red-400':'text-yellow-400');
        h += `<div class="glass p-3 rounded-xl flex justify-between items-center border-l-4 ${i.status=='paid'?'border-green-500':'border-yellow-500'}"><div><div class="font-bold">\u09F3 ${i.amount_bdt}</div><div class="text-[10px] text-gray-400">${new Date(i.created_at).toLocaleDateString()}</div></div><span class="text-xs font-bold uppercase ${col}">${i.status}</span></div>`;
    });
    c.innerHTML = h + `</div>`;
}

function renderRefer(c) {
    const link = `https://t.me/${settings.bot_username}?start=${user.id}`;
    const showInput = !user.referred_by;
    c.innerHTML = `
        <div class="glass p-6 rounded-3xl text-center mt-4 border border-[#FFD700]/30">
            <h2 class="text-xl font-bold">Invite & Earn</h2>
            <p class="text-xs text-gray-400 mt-2">Get <b class="text-[#FFD700]">${settings.referral_bonus} Pts</b> per referral!</p>
        </div>
        <div class="glass p-3 rounded-xl mt-4 flex gap-2"><input value="${link}" readonly class="bg-transparent text-xs w-full outline-none"><button onclick="copyLink('${link}')" class="text-[#FFD700]"><i class="fas fa-copy"></i></button></div>
        ${showInput ? `<div class="glass p-4 rounded-xl mt-4"><p class="text-xs mb-2">Enter Referral Code</p><div class="flex gap-2"><input id="ref-in" placeholder="ID" class="custom-input"><button onclick="subRef()" class="gold-gradient px-4 rounded-lg text-black text-xs font-bold">Apply</button></div></div>` : ''}
        <div class="glass p-4 rounded-xl mt-4 flex justify-between"><div>Total Refers<br><b class="text-xl">${user.referral_count}</b></div><div class="text-right">Bonus<br><b class="text-xl text-[#FFD700]">${user.referral_count * settings.referral_bonus}</b></div></div>
    `;
}

async function subRef() {
    const code = document.getElementById('ref-in').value;
    if(!code) return;
    if(settings.anti_cheat_enabled && localStorage.getItem('dev_ref')) return Swal.fire('Blocked', 'Device used', 'error');
    
    const { data: res } = await sb.rpc('submit_referral_code', { p_user_id: user.id, p_referrer_id: parseInt(code) });
    if(res && res.success) {
        localStorage.setItem('dev_ref', '1'); user.referred_by = code;
        Swal.fire('Success', 'Applied!', 'success'); route('refer');
    } else Swal.fire('Error', res?.message, 'error');
}

function copyLink(txt) {
    navigator.clipboard.writeText(txt);
    Swal.fire({icon:'success', title:'Copied', toast:true, position:'top', showConfirmButton:false, timer:1000});
}

init();
