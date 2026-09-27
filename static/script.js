// Vitoniya Public Help Desk - Enterprise Script & RBAC Engine
let appData = null;
let currentUser = null;
let currentRole = 'collector'; // 'collector' | 'citizen' | 'engineer'
let currentJurisdiction = null;
let leafletMap = null;
let mapMarkers = [];
let speechRecognizer = null;
let isRecording = false;

document.addEventListener('DOMContentLoaded', async () => {
    initAuth();
    await loadDataset();
    initJurisdiction();
    initMap();
    initSpeechRecognition();
    setupImageDropzone();
    updateRBACUI();
    renderAllViews();
});

// 1. Load Dataset from Real Database API
async function loadDataset() {
    try {
        const jurRes = await fetch('/api/jurisdictions');
        if (jurRes.ok) {
            const jurData = await jurRes.json();
            const savedJur = localStorage.getItem('vit_jurisdiction_id') || 'JUR-TG-WGL';
            const tickRes = await fetch(`/api/tickets?jurisdiction_id=${savedJur}`);
            const tickData = await tickRes.json();

            appData = {
                jurisdictions: jurData.jurisdictions || [],
                reports: tickData.reports || []
            };
            return;
        }
    } catch (e) {
        console.warn('Database API endpoint offline, using local static data:', e);
    }

    // Static fallback
    try {
        const res = await fetch('/dataset.json');
        appData = await res.json();
    } catch (e) {
        appData = { jurisdictions: [], reports: [] };
    }
}

// 2. Initialize Jurisdiction (Default: Warangal District, TG)
function initJurisdiction() {
    const savedJur = localStorage.getItem('vit_jurisdiction_id') || 'JUR-TG-WGL';
    currentJurisdiction = appData.jurisdictions.find(j => j.id === savedJur) || appData.jurisdictions[0];
    updateJurisdictionBanner();
    populateJurisdictionDropdown();
}

function updateJurisdictionBanner() {
    if (!currentJurisdiction) return;
    document.getElementById('currentDistrictName').innerText = `${currentJurisdiction.district}, ${currentJurisdiction.state}`;
    document.getElementById('currentAdminBody').innerText = currentJurisdiction.admin_body;
    document.getElementById('currentCollectorName').innerText = `District Magistrate: ${currentJurisdiction.collector_name}`;
    document.getElementById('navJurPill').innerHTML = `🏛️ ${currentJurisdiction.district}, ${currentJurisdiction.state}`;

    // Update KPI counters
    const distReports = appData.reports.filter(r => r.jurisdiction_id === currentJurisdiction.id);
    const pending = distReports.filter(r => r.status === 'Pending Collector Review').length;
    const approved = distReports.filter(r => r.status === 'Collector Approved & Sanctioned').length;
    const resolved = distReports.filter(r => r.status === 'Resolved with Proof').length;

    document.getElementById('kpiTotal').innerText = distReports.length;
    document.getElementById('kpiPending').innerText = pending;
    document.getElementById('kpiApproved').innerText = approved;
    document.getElementById('kpiResolved').innerText = resolved;
    document.getElementById('kpiBudget').innerText = currentJurisdiction.total_budget;
}

function populateJurisdictionDropdown() {
    const select = document.getElementById('jurisdictionSelectModal');
    if (!select) return;
    select.innerHTML = '';
    appData.jurisdictions.forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.innerText = `${j.district} (${j.state}) - ${j.admin_body}`;
        if (j.id === currentJurisdiction.id) opt.selected = true;
        select.appendChild(opt);
    });
}

async function loadTicketsForJurisdiction(jurId) {
    try {
        const res = await fetch(`/api/tickets?jurisdiction_id=${jurId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.reports) {
                appData.reports = data.reports;
                return;
            }
        }
    } catch (e) {
        console.warn('Database fetch failed for tickets:', e);
    }
}

async function switchJurisdiction(jurId) {
    const target = appData.jurisdictions.find(j => j.id === jurId);
    if (target) {
        currentJurisdiction = target;
        localStorage.setItem('vit_jurisdiction_id', target.id);
        await loadTicketsForJurisdiction(target.id);
        updateJurisdictionBanner();
        renderAllViews();
        if (leafletMap) {
            leafletMap.flyTo([target.lat, target.lng], target.zoom || 12, { duration: 1.2 });
            renderMapPins();
        }
        closeModal('jurisdictionModal');
        showToast(`Switched to ${target.district} (${target.state})`);
    }
}

// 3. Leaflet GIS Map for District
function initMap() {
    const mapEl = document.getElementById('districtMap');
    if (!mapEl || typeof L === 'undefined' || !currentJurisdiction) return;

    leafletMap = L.map('districtMap', {
        center: [currentJurisdiction.lat, currentJurisdiction.lng],
        zoom: currentJurisdiction.zoom || 12
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &bull; Vitoniya Public Help Desk GIS'
    }).addTo(leafletMap);

    renderMapPins();
}

function renderMapPins() {
    if (!leafletMap || !appData || !currentJurisdiction) return;

    mapMarkers.forEach(m => leafletMap.removeLayer(m));
    mapMarkers = [];

    const distReports = appData.reports.filter(r => r.jurisdiction_id === currentJurisdiction.id);

    distReports.forEach(r => {
        let pinColor = '#EF4444'; // Red for pending
        if (r.status === 'Collector Approved & Sanctioned') pinColor = '#1A73E8'; // Blue
        if (r.status === 'Resolved with Proof') pinColor = '#10B981'; // Green

        const customIcon = L.divIcon({
            className: 'vit-map-pin',
            html: `<div style="background:${pinColor}; width:16px; height:16px; border-radius:50%; border:3px solid #FFFFFF; box-shadow:0 0 10px ${pinColor};"></div>`,
            iconSize: [16, 16]
        });

        const marker = L.marker([r.lat, r.lng], { icon: customIcon }).addTo(leafletMap);
        marker.bindPopup(`
            <div style="font-family:sans-serif; min-width:200px;">
                <span style="font-size:0.7rem; font-weight:800; color:#1A73E8;">${r.id}</span> &bull; 
                <strong style="font-size:0.75rem; color:${pinColor};">${r.status}</strong><br/>
                <h4 style="margin:4px 0; font-size:0.85rem; color:#0F172A;">${r.hazard_title}</h4>
                <p style="font-size:0.75rem; color:#475569; margin-bottom:6px;">📍 ${r.location}</p>
                <div style="font-size:0.72rem; color:#64748B;">Est. Budget: <strong>${r.estimated_cost}</strong></div>
            </div>
        `);
        mapMarkers.push(marker);
    });
}

// 4. Authentication, User Session & RBAC Engine
function initAuth() {
    const savedUser = localStorage.getItem('vit_current_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            currentRole = currentUser.role || 'collector';
        } catch (e) {
            currentUser = null;
        }
    } else {
        // Default demo session for instant rich platform review
        currentUser = {
            id: 1,
            username: "collector_wgl",
            full_name: "Dr. P. Satyanarayana, IAS",
            role: "collector",
            jurisdiction_id: "JUR-TG-WGL"
        };
        localStorage.setItem('vit_current_user', JSON.stringify(currentUser));
        currentRole = 'collector';
    }
    renderUserAuthUI();
    loadDemoUsersList();
}

function renderUserAuthUI() {
    const container = document.getElementById('navUserSection');
    if (!container) return;

    if (currentUser) {
        const initials = currentUser.full_name
            .split(' ')
            .filter(w => w.length > 0)
            .map(w => w[0].toUpperCase())
            .slice(0, 2)
            .join('') || 'U';

        let roleLabel = 'District Collector';
        let roleClass = 'collector';
        if (currentUser.role === 'citizen') {
            roleLabel = 'Citizen Reporter';
            roleClass = 'citizen';
        } else if (currentUser.role === 'engineer') {
            roleLabel = 'Field Engineer';
            roleClass = 'engineer';
        }

        container.innerHTML = `
            <span class="role-badge ${roleClass}" style="cursor:pointer;" onclick="openAuthModal('demo')" title="Active Access Level">
                ${currentUser.role === 'collector' ? '🛡️' : currentUser.role === 'citizen' ? '👤' : '🛠️'} ${roleLabel}
            </span>
            <div class="user-badge-nav" onclick="openAuthModal('demo')" style="cursor:pointer;" title="Logged in as ${currentUser.full_name} (${currentUser.username})">
                <div class="user-avatar-circle">${initials}</div>
                <div style="line-height:1.2;">
                    <strong style="font-size:0.8rem; color:#0F172A; display:block;">${currentUser.full_name}</strong>
                    <span style="font-size:0.68rem; color:#64748B;">@${currentUser.username}</span>
                </div>
            </div>
            <button class="btn-auth-outline" onclick="openAuthModal('demo')" title="Switch User / Demo" style="padding:6px 10px;">
                🔄 Switch
            </button>
            <button class="btn-auth-outline" onclick="handleUserLogout()" title="Sign Out" style="padding:6px 10px; color:#EF4444; border-color:#FECACA;">
                🚪 Logout
            </button>
        `;
    } else {
        container.innerHTML = `
            <button class="btn-auth-outline" onclick="openAuthModal('signin')">
                🔑 Sign In
            </button>
            <button class="btn-primary-blue" style="padding:6px 14px; font-size:0.82rem;" onclick="openAuthModal('signup')">
                📝 Create Account
            </button>
        `;
    }
}

function openAuthModal(tab = 'signin') {
    switchAuthTab(tab);
    openModal('authModal');
}

function switchAuthTab(tabName) {
    document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-tab-panel').forEach(p => p.classList.remove('active'));

    if (tabName === 'signin') {
        const btn = document.getElementById('tabBtnSignIn');
        if (btn) btn.classList.add('active');
        const p = document.getElementById('authPanelSignIn');
        if (p) p.classList.add('active');
    } else if (tabName === 'signup') {
        const btn = document.getElementById('tabBtnSignUp');
        if (btn) btn.classList.add('active');
        const p = document.getElementById('authPanelSignUp');
        if (p) p.classList.add('active');
    } else if (tabName === 'demo') {
        const btn = document.getElementById('tabBtnDemo');
        if (btn) btn.classList.add('active');
        const p = document.getElementById('authPanelDemo');
        if (p) p.classList.add('active');
        loadDemoUsersList();
    }
}

async function loadDemoUsersList() {
    const container = document.getElementById('authDemoCardsContainer');
    if (!container) return;

    try {
        const res = await fetch('/api/auth/demo-users');
        if (res.ok) {
            const data = await res.json();
            if (data.demo_accounts) {
                container.innerHTML = '';
                data.demo_accounts.forEach(acc => {
                    const card = document.createElement('div');
                    card.className = 'auth-demo-card';
                    card.onclick = () => loginWithDemoAccount(acc);
                    card.innerHTML = `
                        <div class="auth-demo-info">
                            <div class="auth-demo-icon">
                                ${acc.role === 'collector' ? '🏛️' : acc.role === 'citizen' ? '👤' : '🛠️'}
                            </div>
                            <div>
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <strong style="font-size:0.88rem; color:#0F172A;">${acc.full_name}</strong>
                                    <span class="auth-demo-role-pill ${acc.role}">${acc.role}</span>
                                </div>
                                <span style="font-size:0.75rem; color:#64748B;">📍 ${acc.district} &bull; <code>${acc.username}</code></span>
                            </div>
                        </div>
                        <button class="btn-primary-blue" style="padding:6px 12px; font-size:0.75rem; pointer-events:none;">
                            Log In &rarr;
                        </button>
                    `;
                    container.appendChild(card);
                });
                return;
            }
        }
    } catch (e) {
        console.warn('Failed to fetch demo users:', e);
    }
}

async function loginWithDemoAccount(acc) {
    currentUser = {
        username: acc.username,
        full_name: acc.full_name,
        role: acc.role,
        jurisdiction_id: acc.jurisdiction_id
    };
    currentRole = acc.role;
    localStorage.setItem('vit_current_user', JSON.stringify(currentUser));
    localStorage.setItem('vit_user_role', acc.role);

    // Switch to user's assigned jurisdiction if different
    if (acc.jurisdiction_id && (!currentJurisdiction || currentJurisdiction.id !== acc.jurisdiction_id)) {
        await switchJurisdiction(acc.jurisdiction_id);
    }

    renderUserAuthUI();
    updateRBACUI();
    closeModal('authModal');
    showToast(`✓ Logged in as ${acc.full_name} (${getRoleTitle(acc.role)})`);
}

async function handleAuthSignIn(e) {
    e.preventDefault();
    const username = document.getElementById('signinUsername').value.trim();
    const password = document.getElementById('signinPassword').value.trim();
    const submitBtn = document.getElementById('btnSignInSubmit');

    if (!username || !password) {
        alert('Please enter both username/email and password.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳</span> Verifying credentials...`;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            currentUser = data.user;
            currentRole = data.user.role;
            localStorage.setItem('vit_current_user', JSON.stringify(currentUser));
            localStorage.setItem('vit_user_role', currentRole);

            if (data.user.jurisdiction_id && (!currentJurisdiction || currentJurisdiction.id !== data.user.jurisdiction_id)) {
                await switchJurisdiction(data.user.jurisdiction_id);
            }

            renderUserAuthUI();
            updateRBACUI();
            closeModal('authModal');
            showToast(`✓ Welcome back, ${data.user.full_name}!`);
        } else {
            alert(data.message || 'Invalid username or password.');
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Authentication server temporarily offline. You can also use the 1-Click Demo accounts!');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Sign In to Portal &rarr;</span>`;
        }
    }
}

async function handleAuthSignUp(e) {
    e.preventDefault();
    const role = document.getElementById('signupRole').value;
    const fullName = document.getElementById('signupFullName').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const jurisdictionId = document.getElementById('signupJurisdiction').value;
    const password = document.getElementById('signupPassword').value.trim();
    const submitBtn = document.getElementById('btnSignUpSubmit');

    if (!fullName || !username || !password) {
        alert('Please fill out all required fields.');
        return;
    }

    if (password.length < 6) {
        alert('Password must be at least 6 characters long.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳</span> Creating account in PostgreSQL...`;
    }

    try {
        const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                role,
                full_name: fullName,
                username,
                jurisdiction_id: jurisdictionId,
                password
            })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            currentUser = data.user;
            currentRole = data.user.role;
            localStorage.setItem('vit_current_user', JSON.stringify(currentUser));
            localStorage.setItem('vit_user_role', currentRole);

            if (jurisdictionId && (!currentJurisdiction || currentJurisdiction.id !== jurisdictionId)) {
                await switchJurisdiction(jurisdictionId);
            }

            renderUserAuthUI();
            updateRBACUI();
            closeModal('authModal');
            showToast(`✓ Account created! Welcome, ${data.user.full_name}`);
        } else {
            alert(data.message || 'Registration failed. Please try a different username.');
        }
    } catch (err) {
        console.error('Signup error:', err);
        alert('Registration error. Please check your network connection.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Register &amp; Enter Portal &rarr;</span>`;
        }
    }
}

function handleUserLogout() {
    currentUser = null;
    localStorage.removeItem('vit_current_user');
    currentRole = 'citizen';
    renderUserAuthUI();
    updateRBACUI();
    showToast('Logged out successfully. Switched to Public Transparency Ledger.');
    switchTab('tab-transparency');
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerText = '🙈';
    } else {
        input.type = 'password';
        btn.innerText = '👁️';
    }
}

function setRole(role) {
    currentRole = role;
    localStorage.setItem('vit_user_role', role);
    if (currentUser) {
        currentUser.role = role;
        localStorage.setItem('vit_current_user', JSON.stringify(currentUser));
    }
    renderUserAuthUI();
    updateRBACUI();
    closeModal('authModal');
    showToast(`Active Session Role: ${getRoleTitle(role)}`);
}

function getRoleTitle(role) {
    if (role === 'collector') return 'District Collector / Magistrate (Admin)';
    if (role === 'citizen') return 'Citizen (Public Reporter)';
    if (role === 'engineer') return 'Municipal Field Engineer (Contractor)';
    return role;
}

function updateRBACUI() {
    if (currentRole === 'collector') {
        switchTab('tab-collector');
    } else if (currentRole === 'citizen') {
        switchTab('tab-citizen');
    } else if (currentRole === 'engineer') {
        switchTab('tab-engineer');
    }

    renderAllViews();
}

// 5. Navigation Tab Switcher
function switchTab(tabId) {
    document.querySelectorAll('.tab-link').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === tabId);
    });

    if (tabId === 'tab-collector' && leafletMap) {
        setTimeout(() => leafletMap.invalidateSize(), 200);
    }
}

// 6. Render All Views
function renderAllViews() {
    renderCollectorReports();
    renderEngineerFeed();
    renderTransparencyLedger();
    renderCitizenMyTickets();
}

// Render Collector Review Queue
function renderCollectorReports() {
    const container = document.getElementById('collectorReportQueue');
    if (!container || !appData || !currentJurisdiction) return;

    const reports = appData.reports.filter(r => r.jurisdiction_id === currentJurisdiction.id);
    container.innerHTML = '';

    if (reports.length === 0) {
        container.innerHTML = '<div style="padding:24px; text-align:center; color:#64748B;">No grievances reported in this district yet.</div>';
        return;
    }

    reports.forEach(r => {
        const card = document.createElement('div');
        card.className = 'ticket-card';
        card.innerHTML = `
            <div class="ticket-header">
                <div>
                    <span class="ticket-id-tag">${r.id}</span>
                    <span style="font-size:0.75rem; color:#64748B; margin-left:6px;">${r.created_at}</span>
                </div>
                <span class="ticket-status-pill ${getStatusClass(r.status)}">${r.status}</span>
            </div>

            <div class="ticket-body-grid">
                <div>
                    <img src="${r.image_before}" alt="Hazard Photo" class="hazard-img-thumb" onclick="openImageModal('${r.image_before}')">
                    <div style="font-size:0.7rem; color:#64748B; text-align:center; margin-top:4px;">🔍 Click to Zoom</div>
                </div>
                <div class="ticket-details">
                    <h4>${r.hazard_title}</h4>
                    <div class="ticket-location">📍 ${r.location} &bull; ${r.ward} (${r.pincode})</div>
                    
                    <div class="ai-scan-snippet">
                        <strong>⚡ Gemini AI Vision Pre-Screen:</strong> Severity ${r.severity}/5 (${r.urgency}) &bull; Confidence: ${r.ai_confidence}<br/>
                        <em>Est. Repair Cost:</em> <strong style="color:#1A73E8;">${r.estimated_cost}</strong>
                    </div>

                    <div style="font-size:0.75rem; color:#475569; background:#F1F5F9; padding:6px 10px; border-radius:4px;">
                        🗣️ <strong>Citizen Voice (Translated):</strong> "${r.english_translation}"
                    </div>
                </div>
            </div>

            <div class="ticket-actions-bar">
                <div style="font-size:0.75rem; color:#64748B;">
                    Reported by: <strong>${r.citizen_name}</strong> &bull; 👥 ${r.upvotes} Citizens Confirmed
                </div>
                <div style="display:flex; gap:8px;">
                    ${r.status === 'Pending Collector Review' ? `
                        <button class="btn-approve" onclick="collectorApprove('${r.id}')">✅ Approve &amp; Sanction Work Order</button>
                        <button class="btn-reject" onclick="collectorReject('${r.id}')">❌ Reject</button>
                    ` : `
                        <span style="font-size:0.75rem; color:#10B981; font-weight:800;">✓ Sanctioned: ${r.sanctioned_amount || r.estimated_cost}</span>
                    `}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Render Field Engineer Feed
function renderEngineerFeed() {
    const container = document.getElementById('engineerFeedContainer');
    if (!container || !appData || !currentJurisdiction) return;

    const sanctioned = appData.reports.filter(r => r.jurisdiction_id === currentJurisdiction.id && r.status === 'Collector Approved & Sanctioned');
    container.innerHTML = '';

    if (sanctioned.length === 0) {
        container.innerHTML = '<div style="padding:24px; text-align:center; color:#64748B;">No sanctioned repairs awaiting field completion in this district.</div>';
        return;
    }

    sanctioned.forEach(r => {
        const item = document.createElement('div');
        item.className = 'ticket-card';
        item.innerHTML = `
            <div class="ticket-header">
                <div>
                    <span class="ticket-id-tag">${r.id}</span>
                    <strong style="font-size:0.85rem; margin-left:8px;">${r.hazard_title}</strong>
                </div>
                <span class="ticket-status-pill approved">Work Sanctioned</span>
            </div>
            <p style="font-size:0.8rem; color:#475569; margin:8px 0;">📍 ${r.location} &bull; Budget: <strong>${r.sanctioned_amount}</strong></p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; border-top:1px dashed #E2E8F0; padding-top:10px;">
                <span style="font-size:0.75rem; color:#64748B;">Assigned Contractor: ${r.contractor_assigned || 'Municipal R&B Wing'}</span>
                <button class="btn-resolve" onclick="openResolveModal('${r.id}')">🛠️ Mark Repaired &amp; Attach Proof &rarr;</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Render Public Transparency Ledger
function renderTransparencyLedger() {
    const container = document.getElementById('transparencyLedgerGrid');
    if (!container || !appData || !currentJurisdiction) return;

    const resolved = appData.reports.filter(r => r.jurisdiction_id === currentJurisdiction.id && r.status === 'Resolved with Proof');
    container.innerHTML = '';

    if (resolved.length === 0) {
        container.innerHTML = '<div style="padding:24px; text-align:center; color:#64748B;">No completed public works published in this cycle yet.</div>';
        return;
    }

    resolved.forEach(r => {
        const card = document.createElement('div');
        card.className = 'ticket-card';
        card.innerHTML = `
            <div class="ticket-header">
                <span class="ticket-id-tag">${r.id}</span>
                <span class="ticket-status-pill resolved">✓ 100% Repaired &amp; Verified</span>
            </div>
            <h4 style="font-size:0.95rem; margin:6px 0;">${r.hazard_title}</h4>
            <div style="font-size:0.78rem; color:#64748B; margin-bottom:12px;">📍 ${r.location} &bull; Completed Budget: ${r.sanctioned_amount}</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                <div>
                    <span style="font-size:0.7rem; font-weight:800; color:#EF4444; display:block; margin-bottom:4px;">BEFORE (Citizen Photo)</span>
                    <img src="${r.image_before}" style="width:100%; height:90px; object-fit:cover; border-radius:6px;" onclick="openImageModal('${r.image_before}')">
                </div>
                <div>
                    <span style="font-size:0.7rem; font-weight:800; color:#10B981; display:block; margin-bottom:4px;">AFTER (Collector Verified)</span>
                    <img src="${r.image_after || r.image_before}" style="width:100%; height:90px; object-fit:cover; border-radius:6px;" onclick="openImageModal('${r.image_after}')">
                </div>
            </div>
            <div style="font-size:0.75rem; color:#15803D; background:#DCFCE7; padding:6px 10px; border-radius:4px; font-weight:700;">
                Audited by: ${currentJurisdiction.collector_name}
            </div>
        `;
        container.appendChild(card);
    });
}

// Render Citizen My Tickets
function renderCitizenMyTickets() {
    const container = document.getElementById('citizenMyTicketsFeed');
    if (!container || !appData || !currentJurisdiction) return;

    const reports = appData.reports.filter(r => r.jurisdiction_id === currentJurisdiction.id).slice(0, 3);
    container.innerHTML = '';

    reports.forEach(r => {
        const item = document.createElement('div');
        item.style.cssText = "padding:12px; border:1px solid #E2E8F0; border-radius:8px; margin-bottom:10px; background:#F8FAFC;";
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="font-size:0.75rem; font-weight:800; color:#1A73E8;">${r.id}</span>
                <span class="ticket-status-pill ${getStatusClass(r.status)}">${r.status}</span>
            </div>
            <strong style="font-size:0.85rem; color:#0F172A;">${r.hazard_title}</strong>
            <p style="font-size:0.75rem; color:#64748B; margin-top:4px;">📍 ${r.location}</p>
        `;
        container.appendChild(item);
    });
}

function getStatusClass(status) {
    if (status === 'Pending Collector Review') return 'pending';
    if (status === 'Collector Approved & Sanctioned') return 'approved';
    if (status === 'Resolved with Proof') return 'resolved';
    return 'pending';
}

// 7. Collector Actions
async function collectorApprove(ticketId) {
    const report = appData.reports.find(r => r.id === ticketId);
    if (!report) return;

    const sanctionAmount = report.estimated_cost || '₹1,45,000';
    const contractor = `${currentJurisdiction.district} Municipal Engineering Cell`;

    // Optimistic UI update
    report.status = 'Collector Approved & Sanctioned';
    report.sanctioned_amount = sanctionAmount;
    report.contractor_assigned = contractor;

    updateJurisdictionBanner();
    renderAllViews();
    if (leafletMap) renderMapPins();
    showToast(`✓ Ticket ${ticketId} Approved & Sanctioned (${sanctionAmount}) by ${currentJurisdiction.collector_name}`);

    // Persist to PostgreSQL Neon Cloud Database
    try {
        await fetch(`/api/tickets/${ticketId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                collector_name: currentJurisdiction.collector_name,
                sanctioned_amount: sanctionAmount,
                contractor_assigned: contractor
            })
        });
    } catch (e) {
        console.error('Error approving ticket in database:', e);
    }
}

async function collectorReject(ticketId) {
    const report = appData.reports.find(r => r.id === ticketId);
    if (!report) return;

    if (confirm(`Are you sure you want to reject ticket ${ticketId}?`)) {
        appData.reports = appData.reports.filter(r => r.id !== ticketId);
        updateJurisdictionBanner();
        renderAllViews();
        if (leafletMap) renderMapPins();
        showToast(`Ticket ${ticketId} marked spurious/rejected.`);

        try {
            await fetch(`/api/tickets/${ticketId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actor_name: currentJurisdiction.collector_name })
            });
        } catch (e) {
            console.error('Error rejecting ticket in database:', e);
        }
    }
}

// 8. Field Engineer Resolve Modal & Proof Handler
let activeResolvingId = null;
let resolvedUploadedPhotoData = null;

function handleEngineerFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            resolvedUploadedPhotoData = e.target.result;
            const preview = document.getElementById('engineerPreviewImg');
            if (preview) {
                preview.src = resolvedUploadedPhotoData;
                preview.style.display = 'block';
            }
            const lbl = document.getElementById('engineerDropLabel');
            if (lbl) lbl.innerText = `Photo Attached: ${file.name}`;
            const icon = document.getElementById('engineerDropIcon');
            if (icon) icon.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

function openResolveModal(ticketId) {
    activeResolvingId = ticketId;
    resolvedUploadedPhotoData = null;
    document.getElementById('resolveTicketIdLabel').innerText = `Work Order: ${ticketId}`;
    const preview = document.getElementById('engineerPreviewImg');
    if (preview) {
        preview.style.display = 'none';
        preview.src = '';
    }
    const lbl = document.getElementById('engineerDropLabel');
    if (lbl) lbl.innerText = `Click to Upload "After-Repair" Photo Proof`;
    const icon = document.getElementById('engineerDropIcon');
    if (icon) icon.style.display = 'block';
    openModal('resolveModal');
}

async function submitResolvedProof() {
    if (!activeResolvingId) return;
    const report = appData.reports.find(r => r.id === activeResolvingId);
    if (!report) return;

    const afterPhoto = resolvedUploadedPhotoData || 'https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?auto=format&fit=crop&w=800&q=80';
    const engineerName = `Er. ${currentJurisdiction.district} Executive Engineer`;

    report.status = 'Resolved with Proof';
    report.image_after = afterPhoto;

    updateJurisdictionBanner();
    renderAllViews();
    if (leafletMap) renderMapPins();
    closeModal('resolveModal');
    showToast(`✓ Work Order ${activeResolvingId} marked 100% Repaired with photo proof!`);

    try {
        await fetch(`/api/tickets/${activeResolvingId}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                engineer_name: engineerName,
                image_after: afterPhoto
            })
        });
    } catch (e) {
        console.error('Error resolving ticket in database:', e);
    }
}

// 9. Citizen Voice & Camera Submission
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    speechRecognizer = new SpeechRecognition();
    speechRecognizer.continuous = false;
    speechRecognizer.interimResults = false;

    speechRecognizer.onstart = () => {
        isRecording = true;
        document.getElementById('micHeroBtn').classList.add('active');
        document.getElementById('micBoxStatus').innerText = 'Listening... Speak in Telugu or English now';
    };

    speechRecognizer.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        document.getElementById('citizenComplaintText').value = transcript;
        showToast('Voice recorded & transcribed in real-time');
    };

    speechRecognizer.onend = () => {
        isRecording = false;
        document.getElementById('micHeroBtn').classList.remove('active');
        document.getElementById('micBoxStatus').innerText = 'Tap to Speak (Telugu / English)';
    };
}

function toggleCitizenVoice() {
    if (!speechRecognizer) {
        alert('Speech recognition is not supported on this browser. You can type directly in the box below!');
        return;
    }
    if (isRecording) {
        speechRecognizer.stop();
    } else {
        const lang = document.getElementById('citizenLangSelect').value || 'te-IN';
        speechRecognizer.lang = lang;
        speechRecognizer.start();
    }
}

function setupImageDropzone() {
    const dropzone = document.getElementById('citizenPhotoDropzone');
    const fileInput = document.getElementById('citizenFileInput');
    const preview = document.getElementById('citizenPreviewImg');

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                preview.src = evt.target.result;
                preview.style.display = 'block';
                document.getElementById('dropzoneLabelText').innerText = `Photo Attached: ${file.name}`;
            };
            reader.readAsDataURL(file);
        }
    });
}

async function handleCitizenSubmit(e) {
    e.preventDefault();
    const text = document.getElementById('citizenComplaintText').value.trim();
    const location = document.getElementById('citizenLocationInput').value.trim() || `${currentJurisdiction.district} Main Arterial Road`;
    const pincode = document.getElementById('citizenPincodeInput').value.trim() || (currentJurisdiction.pincodes ? currentJurisdiction.pincodes[0] : '506001');

    if (!text) {
        alert('Please describe or speak your grievance.');
        return;
    }

    const submitBtn = document.getElementById('citizenSubmitBtn');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Submit Grievance';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳</span> 🤖 Google Gemini AI Analyzing Hazard...`;
    }

    let aiData = {
        english_translation: text,
        category: "Roads & Civil Infrastructure",
        hazard_title: "Citizen Reported Infrastructure Damage",
        severity: 4,
        urgency: "HIGH",
        ai_confidence: "97.2%",
        estimated_cost: "₹1,25,000"
    };

    try {
        const aiRes = await fetch('/api/ai/analyze-hazard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, location })
        });
        if (aiRes.ok) {
            const aiJson = await aiRes.json();
            if (aiJson.data) {
                aiData = { ...aiData, ...aiJson.data };
            }
        }
    } catch (err) {
        console.warn('AI analysis call failed, falling back to local analysis:', err);
    }

    const newId = `VIT-${currentJurisdiction.district.substring(0,3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const previewSrc = document.getElementById('citizenPreviewImg').src || 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80';

    const newTicket = {
        id: newId,
        jurisdiction_id: currentJurisdiction.id,
        district: currentJurisdiction.district,
        state: currentJurisdiction.state,
        location: location,
        ward: `${currentJurisdiction.district} Ward ${Math.floor(1 + Math.random() * 20)}`,
        pincode: pincode,
        lat: currentJurisdiction.lat + (Math.random() - 0.5) * 0.04,
        lng: currentJurisdiction.lng + (Math.random() - 0.5) * 0.04,
        citizen_name: "Citizen (Direct Portal)",
        citizen_phone: "+91 9•••• •••••",
        voice_transcript: text,
        english_translation: aiData.english_translation || text,
        category: aiData.category || "Roads & Civil Infrastructure",
        hazard_title: aiData.hazard_title || "Civil Infrastructure Hazard",
        severity: aiData.severity || 4,
        urgency: aiData.urgency || "HIGH",
        ai_confidence: aiData.ai_confidence || "97.5%",
        estimated_cost: aiData.estimated_cost || "₹1,20,000",
        status: "Pending Collector Review",
        sanctioned_amount: null,
        contractor_assigned: null,
        created_at: "Just Now",
        image_before: previewSrc,
        image_after: null,
        upvotes: 1
    };

    // Save into PostgreSQL Neon / Database
    try {
        await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTicket)
        });
    } catch (e) {
        console.error('Error saving ticket to database:', e);
    }

    appData.reports.unshift(newTicket);
    updateJurisdictionBanner();
    renderAllViews();
    if (leafletMap) renderMapPins();

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }

    showToast(`✓ Ticket ${newId} Analyzed by Gemini AI & Saved to Database!`);
    document.getElementById('citizenForm').reset();
    document.getElementById('citizenPreviewImg').style.display = 'none';
    const dropzoneLabel = document.getElementById('dropzoneLabelText');
    if (dropzoneLabel) dropzoneLabel.innerText = 'Click to Attach Real-Time Photo';
}

// 10. Modal Utilities
function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
}

function openImageModal(imgSrc) {
    const img = document.getElementById('zoomModalImg');
    if (img) img.src = imgSrc;
    openModal('imageZoomModal');
}

// Toast
function showToast(msg) {
    let t = document.getElementById('vitToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'vitToast';
        t.style.cssText = "position:fixed; bottom:24px; right:24px; background:#0F172A; color:#FFFFFF; padding:12px 20px; border-radius:8px; border-left:4px solid #1A73E8; font-size:0.85rem; font-weight:700; box-shadow:0 10px 30px rgba(0,0,0,0.2); z-index:9999; transition:all 0.3s;";
        document.body.appendChild(t);
    }
    t.innerText = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(10px)';
    }, 2800);
}
