// Initialize Supabase Client
const SUPABASE_URL = "https://swvsorrytvyvivyhodzr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_blwj0OlfeaExbI8VWwSZPg_BHE8Cogu";
const GEMINI_API_KEY = "AQ.Ab8RN6KU6zB-pgqlvMKAA-mDCo45p4nZnmxWXIGcEcU1tGW7AA";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentQueue = [];
let currentPrintData = null;
let activeFilter = 'All';

// Settings handling (localStorage)
function getShopSettings() {
  return {
    name: localStorage.getItem('rt_shop_name') || 'Workshop Operations',
    address: localStorage.getItem('rt_shop_address') || 'Workshop operations, customer tickets, and warranty audit.',
    phone: localStorage.getItem('rt_shop_phone') || ''
  };
}

function updateShopHeader() {
  const settings = getShopSettings();
  document.getElementById('header-shop-name').innerText = settings.name;
  document.getElementById('header-shop-address').innerText = settings.address;
}

// Financial calculations
const inputCost = document.getElementById('estimated-cost');
const inputDeposit = document.getElementById('deposit-paid');
const inputBalance = document.getElementById('balance-due');

function calculateBalance() {
  const cost = parseFloat(inputCost.value) || 0;
  const deposit = parseFloat(inputDeposit.value) || 0;
  inputBalance.value = Math.max(0, cost - deposit);
}
inputCost.addEventListener('input', calculateBalance);
inputDeposit.addEventListener('input', calculateBalance);

// 1. Filter Handlers
window.setFilter = function(filterName) {
  activeFilter = filterName;
  ['All', 'Active', 'Ready', 'Collected'].forEach(f => {
    const el = document.getElementById(`filter-${f}`);
    if (f === filterName) {
      el.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-sm transition';
    } else {
      el.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/60 transition';
    }
  });
  renderQueueTable();
};

function renderQueueTable() {
  const tbody = document.getElementById('tickets-table-body');
  
  let filtered = currentQueue;
  if (activeFilter === 'Active') {
    filtered = currentQueue.filter(t => t.status !== 'Collected');
  } else if (activeFilter === 'Ready') {
    filtered = currentQueue.filter(t => t.status === 'Ready');
  } else if (activeFilter === 'Collected') {
    filtered = currentQueue.filter(t => t.status === 'Collected');
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-500 font-medium">No tickets match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(ticket => `
    <tr class="hover:bg-slate-900/40 transition">
      <td class="py-3 px-3 font-mono font-bold text-xs text-indigo-400">${ticket.ticket_code || 'N/A'}</td>
      <td class="py-3 px-3">
        <span class="font-medium text-slate-100">${ticket.customer_name || 'N/A'}</span>
        <br><span class="text-xs text-slate-500 font-mono">${ticket.customer_phone || ''}</span>
      </td>
      <td class="py-3 px-3">
        <span class="font-medium text-slate-200">${ticket.brand_model || 'N/A'}</span>
        <br><span class="text-xs text-slate-400 truncate max-w-xs block">${ticket.reported_fault || ''}</span>
      </td>
      <td class="py-3 px-3 font-mono font-semibold text-slate-200">
        ₦${Number(ticket.balance_due ?? ticket.estimated_price ?? 0).toLocaleString()}
      </td>
      <td class="py-3 px-3">
        <select 
          onchange="updateTicketStatus('${ticket.id}', this.value)" 
          class="text-xs rounded-lg px-2.5 py-1 font-semibold focus:outline-none transition ${getStatusStyle(ticket.status)}"
        >
          <option value="Received" ${ticket.status === 'Received' ? 'selected' : ''}>Received</option>
          <option value="In Progress" ${ticket.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Awaiting Parts" ${ticket.status === 'Awaiting Parts' ? 'selected' : ''}>Awaiting Parts</option>
          <option value="Ready" ${ticket.status === 'Ready' ? 'selected' : ''}>Ready for Pickup</option>
          <option value="Collected" ${ticket.status === 'Collected' ? 'selected' : ''}>Collected</option>
        </select>
      </td>
      <td class="py-3 px-3 text-right">
        <button 
          onclick="triggerPrintById('${ticket.id}')"
          class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700/80 font-semibold transition"
        >
          Tag
        </button>
      </td>
    </tr>
  `).join('');
}

// 2. Load Tickets & Refresh Metrics
async function loadTickets() {
  const tbody = document.getElementById('tickets-table-body');
  tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-500 font-medium">Loading workshop tickets...</td></tr>`;

  const { data, error } = await db
    .from('repairs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-rose-400">Error loading queue. Check network.</td></tr>`;
    return;
  }

  currentQueue = data || [];

  let activeCount = 0;
  let readyCount = 0;
  let collectedCount = 0;
  let totalDeposits = 0;
  let totalBalances = 0;

  currentQueue.forEach(t => {
    if (t.status !== 'Collected') {
      activeCount++;
      totalBalances += (Number(t.balance_due) || 0);
    } else {
      collectedCount++;
    }
    if (t.status === 'Ready') {
      readyCount++;
    }
    totalDeposits += (Number(t.deposit_paid) || 0);
  });

  document.getElementById('metric-active').innerText = activeCount;
  document.getElementById('metric-ready').innerText = readyCount;
  document.getElementById('metric-deposits').innerText = `₦${totalDeposits.toLocaleString()}`;
  document.getElementById('metric-balances').innerText = `₦${totalBalances.toLocaleString()}`;

  document.getElementById('count-all').innerText = currentQueue.length;
  document.getElementById('count-active').innerText = activeCount;
  document.getElementById('count-ready').innerText = readyCount;
  document.getElementById('count-collected').innerText = collectedCount;

  renderQueueTable();
}

function getStatusStyle(status) {
  switch (status) {
    case 'Received': return 'bg-slate-800 text-slate-300 border border-slate-700';
    case 'In Progress': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    case 'Awaiting Parts': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    case 'Ready': return 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold';
    case 'Collected': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    default: return 'bg-slate-800 text-slate-300 border border-slate-700';
  }
}

// 3. Status Progression
window.updateTicketStatus = async function(id, newStatus) {
  const ticket = currentQueue.find(t => t.id === id);
  const updatePayload = { status: newStatus };

  if (newStatus === 'Collected') {
    updatePayload.collected_at = new Date().toISOString();
    updatePayload.balance_due = 0;
  }

  const { error } = await db.from('repairs').update(updatePayload).eq('id', id);

  if (error) {
    alert(`Failed to update status: ${error.message}`);
    return;
  }

  if (newStatus === 'Ready' && ticket) {
    const settings = getShopSettings();
    const cleanPhone = (ticket.customer_phone || '').replace(/[^0-9]/g, '');
    const balance = ticket.balance_due ?? 0;
    const trackingUrl = `${window.location.origin}/?track=${ticket.ticket_code}`;
    
    const message = `*${settings.name.toUpperCase()} - DEVICE READY*\n\n` +
      `Hello *${ticket.customer_name}*,\n` +
      `Your *${ticket.brand_model}* (Ticket: ${ticket.ticket_code}) is fully repaired, tested, and ready for pickup!\n\n` +
      `*Balance Due:* ₦${Number(balance).toLocaleString()}\n` +
      `*Track Live / View Details:* ${trackingUrl}\n` +
      `*Workshop Address:* ${settings.address}\n\n` +
      `Thank you for trusting our workshop!`;

    const sendAlert = confirm(`Device marked READY. Send automated WhatsApp pickup alert to ${ticket.customer_name}?`);
    if (sendAlert && cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  }

  loadTickets();
};

// 4. Ticket Intake
document.getElementById('intake-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerText = "Registering...";

  const ticketCode = `REP-${Math.floor(1000 + Math.random() * 9000)}`;
  const cost = parseFloat(inputCost.value) || 0;
  const deposit = parseFloat(inputDeposit.value) || 0;
  const balance = Math.max(0, cost - deposit);

  const payload = {
    ticket_code: ticketCode,
    customer_name: document.getElementById('customer-name').value.trim(),
    customer_phone: document.getElementById('customer-phone').value.trim(),
    device_type: document.getElementById('device-type').value,
    brand_model: document.getElementById('brand-model').value.trim(),
    serial_number: document.getElementById('serial-number').value.trim(),
    reported_fault: document.getElementById('reported-fault').value.trim(),
    estimated_price: cost,
    deposit_paid: deposit,
    balance_due: balance,
    warranty_days: parseInt(document.getElementById('warranty-days').value) || 30,
    status: 'Received'
  };

  const { error } = await db.from('repairs').insert([payload]);

  if (error) {
    alert(`Intake failed: ${error.message}`);
    btn.disabled = false;
    btn.innerText = "Register Intake & Generate Receipt";
    return;
  }

  currentPrintData = payload;
  const settings = getShopSettings();
  const cleanPhone = payload.customer_phone.replace(/[^0-9]/g, '');
  const trackingUrl = `${window.location.origin}/?track=${ticketCode}`;

  const message = `*${settings.name.toUpperCase()} - REPAIR INTAKE RECEIPT*\n\n` +
    `Hello *${payload.customer_name}*,\nYour device has been booked in.\n\n` +
    `*Ticket Code:* ${ticketCode}\n` +
    `*Device:* ${payload.brand_model}\n` +
    `*Serial/IMEI:* ${payload.serial_number}\n` +
    `*Reported Fault:* ${payload.reported_fault}\n` +
    `*Agreed Cost:* ₦${cost.toLocaleString()}\n` +
    `*Deposit Paid:* ₦${deposit.toLocaleString()}\n` +
    `*Balance Due:* ₦${balance.toLocaleString()}\n` +
    `*Warranty:* ${payload.warranty_days} Days (starts on pickup)\n\n` +
    `*Check Live Status Anytime:* ${trackingUrl}\n\n` +
    `_Notice: Devices uncollected after 30 days of completion may be auctioned to recover costs._`;

  document.getElementById('display-ticket-code').innerText = ticketCode;
  document.getElementById('btn-whatsapp').href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  document.getElementById('receipt-modal').classList.remove('hidden');

  document.getElementById('intake-form').reset();
  inputBalance.value = '';
  btn.disabled = false;
  btn.innerText = "Register Intake & Generate Receipt";

  loadTickets();
});

// 5. Thermal Slip Printing with QR Code Generation
window.triggerPrintById = function(id) {
  const ticket = currentQueue.find(t => t.id === id);
  if (ticket) printSlip(ticket);
};

document.getElementById('btn-print-tag').addEventListener('click', () => {
  if (currentPrintData) printSlip(currentPrintData);
});

function printSlip(data) {
  const settings = getShopSettings();
  document.getElementById('print-shop-name').innerText = settings.name;
  document.getElementById('print-shop-address').innerText = settings.address;
  document.getElementById('print-date').innerText = new Date().toLocaleString();
  document.getElementById('print-ticket').innerText = data.ticket_code;
  document.getElementById('print-customer').innerText = data.customer_name;
  document.getElementById('print-phone').innerText = data.customer_phone;
  document.getElementById('print-device').innerText = data.brand_model;
  document.getElementById('print-serial').innerText = data.serial_number;
  document.getElementById('print-fault').innerText = data.reported_fault;
  document.getElementById('print-cost').innerText = Number(data.estimated_price || 0).toLocaleString();
  document.getElementById('print-deposit').innerText = Number(data.deposit_paid || 0).toLocaleString();
  document.getElementById('print-balance').innerText = Number(data.balance_due || 0).toLocaleString();

  // Generate QR Code dynamically
  const qrContainer = document.getElementById('qrcode-container');
  qrContainer.innerHTML = '';
  const trackingUrl = `${window.location.origin}/?track=${data.ticket_code}`;
  
  if (window.QRCode) {
    new QRCode(qrContainer, {
      text: trackingUrl,
      width: 88,
      height: 88,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  const tag = document.getElementById('printable-tag');
  tag.classList.remove('hidden');
  setTimeout(() => {
    window.print();
    tag.classList.add('hidden');
  }, 250);
}

// 6. CSV Earnings & Tickets Export
document.getElementById('btn-export-csv').addEventListener('click', () => {
  if (!currentQueue || currentQueue.length === 0) {
    alert("No tickets available to export.");
    return;
  }

  const headers = ["Ticket Code", "Date", "Customer Name", "Phone", "Device", "Serial/IMEI", "Fault", "Cost", "Deposit", "Balance Due", "Status"];
  const rows = currentQueue.map(t => [
    `"${t.ticket_code || ''}"`,
    `"${new Date(t.created_at).toLocaleDateString()}"`,
    `"${(t.customer_name || '').replace(/"/g, '""')}"`,
    `"${t.customer_phone || ''}"`,
    `"${(t.brand_model || '').replace(/"/g, '""')}"`,
    `"${t.serial_number || ''}"`,
    `"${(t.reported_fault || '').replace(/"/g, '""')}"`,
    t.estimated_price || 0,
    t.deposit_paid || 0,
    t.balance_due || 0,
    `"${t.status || ''}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `workshop_report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// 7. Warranty Verification
document.getElementById('btn-search').addEventListener('click', async () => {
  const query = document.getElementById('search-input').value.trim();
  const searchResult = document.getElementById('search-result');
  if (!query) return;

  searchResult.classList.remove('hidden');
  searchResult.className = "mt-3 p-4 rounded-xl border text-sm bg-slate-900 border-slate-800 text-slate-300";
  searchResult.innerHTML = "Auditing records...";

  const { data, error } = await db
    .from('repairs')
    .select('*')
    .or(`serial_number.ilike.%${query}%,ticket_code.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    searchResult.className = "mt-3 p-4 rounded-xl border text-sm bg-rose-950/40 border-rose-500/30 text-rose-300";
    searchResult.innerHTML = `<strong>No Records Found:</strong> No history matches "${query}".`;
    return;
  }

  const record = data[0];
  const warrantyDays = record.warranty_days || 30;

  if (!record.collected_at) {
    searchResult.className = "mt-3 p-4 rounded-xl border text-sm bg-amber-950/40 border-amber-500/30 text-amber-200";
    searchResult.innerHTML = `
      <div class="space-y-1">
        <p class="font-bold text-base text-amber-100">${record.brand_model}</p>
        <p class="text-xs">Ticket: <span class="font-mono text-white">${record.ticket_code}</span> | Serial: <span class="font-mono text-white">${record.serial_number}</span></p>
        <p class="text-xs">Current Workshop Status: <strong>${record.status}</strong></p>
        <p class="text-xs font-semibold text-amber-400 pt-1">Warranty inactive: Device has not been collected yet.</p>
      </div>
    `;
    return;
  }

  const collectionDate = new Date(record.collected_at);
  const expiryDate = new Date(collectionDate.getTime() + warrantyDays * 24 * 60 * 60 * 1000);
  const isWarrantyValid = new Date() <= expiryDate;

  searchResult.className = `mt-3 p-4 rounded-xl border text-sm ${isWarrantyValid ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'}`;
  searchResult.innerHTML = `
    <div class="flex flex-col sm:flex-row justify-between items-start gap-2">
      <div class="space-y-1">
        <p class="font-bold text-base text-white">${record.brand_model}</p>
        <p class="text-xs">Customer: ${record.customer_name} (${record.customer_phone})</p>
        <p class="text-xs font-mono">Ticket: ${record.ticket_code} | Serial: ${record.serial_number}</p>
        <p class="text-xs">Collected: ${collectionDate.toLocaleDateString()} | Policy Expiry: ${expiryDate.toLocaleDateString()}</p>
      </div>
      <div class="text-left sm:text-right">
        <span class="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isWarrantyValid ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}">
          ${isWarrantyValid ? 'Warranty Active' : 'Warranty Expired'}
        </span>
        <p class="text-xs mt-1 text-slate-400">${warrantyDays}-Day Term</p>
      </div>
    </div>
  `;
});

// 8. Gemini Diagnostic Assistant
const btnGeminiDiagnose = document.getElementById('btn-gemini-diagnose');
const geminiBox = document.getElementById('gemini-diagnostic-box');
const geminiContent = document.getElementById('gemini-content');
const btnCloseGemini = document.getElementById('btn-close-gemini');

if (btnGeminiDiagnose) {
  btnGeminiDiagnose.addEventListener('click', async () => {
    const brandModel = document.getElementById('brand-model').value.trim();
    const fault = document.getElementById('reported-fault').value.trim();
    const deviceType = document.getElementById('device-type').value;

    if (!fault) {
      alert("Please enter the reported fault symptoms first.");
      return;
    }

    geminiBox.classList.remove('hidden');
    geminiContent.innerHTML = `<span class="animate-pulse text-indigo-400 font-medium">Running Gemini diagnostic analysis for ${brandModel || deviceType}...</span>`;
    btnGeminiDiagnose.disabled = true;

    const prompt = `You are an elite electronics and computer repair technician workbench assistant.
Device: ${deviceType} - ${brandModel || 'Unspecified Model'}
Reported Symptoms / Fault: ${fault}

Provide a concise, practical bench diagnosis in under 120 words with 3 sections:
1. Probable Root Cause (e.g. blown capacitor, corrupted BIOS, damaged digitizer ribbon, PMIC failure)
2. Bench Test Steps (what multimeter test, voltage check, or isolation step to run first)
3. Estimated Repair Difficulty & Parts Needed`;

    const primaryModel = 'gemini-3.8-flash';
    const fallbackModel = 'gemini-3.6-flash';

    async function requestDiagnosis(model) {
      return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
    }

    try {
      let response = await requestDiagnosis(primaryModel);
      if (!response.ok) {
        response = await requestDiagnosis(fallbackModel);
      }

      const result = await response.json();
      if (result.error) throw new Error(result.error.message);

      const diagnosisText = result.candidates?.[0]?.content?.parts?.[0]?.text || "No diagnosis generated.";
      geminiContent.innerHTML = diagnosisText
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
        .replace(/\n/g, '<br>');
    } catch (err) {
      geminiContent.innerHTML = `<span class="text-rose-400">Diagnosis error: ${err.message}</span>`;
    } finally {
      btnGeminiDiagnose.disabled = false;
    }
  });

  btnCloseGemini.addEventListener('click', () => {
    geminiBox.classList.add('hidden');
  });
}

// 9. Customer Live Tracking Link (?track=REP-xxxx)
async function handlePublicTracking() {
  const urlParams = new URLSearchParams(window.location.search);
  const trackCode = urlParams.get('track');
  if (!trackCode) return;

  const trackView = document.getElementById('customer-tracker-view');
  const trackTitle = document.getElementById('tracker-device-title');
  const trackBadge = document.getElementById('tracker-status-badge');
  const trackContent = document.getElementById('tracker-content');

  trackView.classList.remove('hidden');
  trackView.scrollIntoView({ behavior: 'smooth' });

  const { data } = await db.from('repairs').select('*').eq('ticket_code', trackCode).single();

  if (!data) {
    trackTitle.innerText = "Ticket Not Found";
    trackBadge.innerText = "Error";
    trackContent.innerHTML = `<p class="text-rose-400">No repair ticket matches <strong>${trackCode}</strong>.</p>`;
    return;
  }

  trackTitle.innerText = data.brand_model;
  trackBadge.innerText = data.status;
  trackBadge.className = `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusStyle(data.status)}`;
  trackContent.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
      <div><strong>Reported Fault:</strong> ${data.reported_fault}</div>
      <div><strong>Balance Due:</strong> ₦${Number(data.balance_due || 0).toLocaleString()}</div>
      <div><strong>Intake Date:</strong> ${new Date(data.created_at).toLocaleDateString()}</div>
      <div><strong>Warranty Period:</strong> ${data.warranty_days} days after collection</div>
    </div>
  `;
}

// 10. Settings Modal Handlers
const settingsModal = document.getElementById('settings-modal');
document.getElementById('btn-open-settings').addEventListener('click', () => {
  const current = getShopSettings();
  document.getElementById('setting-shop-name').value = current.name === 'Workshop Operations' ? '' : current.name;
  document.getElementById('setting-shop-address').value = current.address.includes('Workshop operations') ? '' : current.address;
  document.getElementById('setting-shop-phone').value = current.phone;
  settingsModal.classList.remove('hidden');
});

document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));

document.getElementById('btn-save-settings').addEventListener('click', () => {
  const name = document.getElementById('setting-shop-name').value.trim() || 'Workshop Operations';
  const address = document.getElementById('setting-shop-address').value.trim() || 'Workshop operations, customer tickets, and warranty audit.';
  const phone = document.getElementById('setting-shop-phone').value.trim();

  localStorage.setItem('rt_shop_name', name);
  localStorage.setItem('rt_shop_address', address);
  localStorage.setItem('rt_shop_phone', phone);

  updateShopHeader();
  settingsModal.classList.add('hidden');
});

document.getElementById('btn-refresh').addEventListener('click', loadTickets);

// Init
updateShopHeader();
loadTickets();
handlePublicTracking();
