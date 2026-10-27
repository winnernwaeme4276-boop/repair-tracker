// Initialize Supabase Client
const SUPABASE_URL = "https://swvsorrytvyvivyhodzr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_blwj0OlfeaExbI8VWwSZPg_BHE8Cogu";
const GEMINI_API_KEY = "AQ.Ab8RN6KU6zB-pgqlvMKAA-mDCo45p4nZnmxWXIGcEcU1tGW7AA";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State cache to prevent HTML injection errors
let currentQueue = [];
let currentPrintData = null;

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

// Balance Auto-calculation
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

// 1. Load Workshop Queue
async function loadTickets() {
  const tbody = document.getElementById('tickets-table-body');
  tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-400">Loading tickets...</td></tr>`;

  const { data, error } = await db
    .from('repairs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-rose-500">Error loading queue.</td></tr>`;
    return;
  }

  currentQueue = data || [];

  if (currentQueue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-400">No active tickets registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = currentQueue.map(ticket => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-2.5 px-3 font-mono font-bold text-xs text-slate-900">${ticket.ticket_code || 'N/A'}</td>
      <td class="py-2.5 px-3">
        <span class="font-medium text-slate-800">${ticket.customer_name || 'N/A'}</span>
        <br><span class="text-xs text-slate-400">${ticket.customer_phone || ''}</span>
      </td>
      <td class="py-2.5 px-3">
        <span class="font-medium text-slate-800">${ticket.brand_model || 'N/A'}</span>
        <br><span class="text-xs text-slate-500 truncate max-w-xs block">${ticket.reported_fault || ''}</span>
      </td>
      <td class="py-2.5 px-3 font-semibold text-slate-800">
        ₦${Number(ticket.balance_due ?? ticket.estimated_price ?? 0).toLocaleString()}
      </td>
      <td class="py-2.5 px-3">
        <select 
          onchange="updateTicketStatus('${ticket.id}', this.value)" 
          class="text-xs border rounded px-2 py-1 bg-white font-medium ${getStatusColor(ticket.status)}"
        >
          <option value="Received" ${ticket.status === 'Received' ? 'selected' : ''}>Received</option>
          <option value="In Progress" ${ticket.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Awaiting Parts" ${ticket.status === 'Awaiting Parts' ? 'selected' : ''}>Awaiting Parts</option>
          <option value="Ready" ${ticket.status === 'Ready' ? 'selected' : ''}>Ready for Pickup</option>
          <option value="Collected" ${ticket.status === 'Collected' ? 'selected' : ''}>Collected</option>
        </select>
      </td>
      <td class="py-2.5 px-3 text-right">
        <button 
          onclick="triggerPrintById('${ticket.id}')"
          class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded border border-slate-300"
        >
          Tag
        </button>
      </td>
    </tr>
  `).join('');
}

function getStatusColor(status) {
  switch (status) {
    case 'Received': return 'text-slate-700 border-slate-300';
    case 'In Progress': return 'text-blue-700 border-blue-300 bg-blue-50';
    case 'Awaiting Parts': return 'text-amber-700 border-amber-300 bg-amber-50';
    case 'Ready': return 'text-purple-700 border-purple-300 bg-purple-50 font-bold';
    case 'Collected': return 'text-emerald-700 border-emerald-300 bg-emerald-50';
    default: return 'text-slate-700';
  }
}

// 2. Status Updates & One-Click "Ready for Pickup" Alert
window.updateTicketStatus = async function(id, newStatus) {
  const ticket = currentQueue.find(t => t.id === id);
  const updatePayload = { status: newStatus };

  if (newStatus === 'Collected') {
    updatePayload.collected_at = new Date().toISOString();
    updatePayload.balance_due = 0; // Balance cleared upon final collection
  }

  const { error } = await db.from('repairs').update(updatePayload).eq('id', id);

  if (error) {
    alert(`Failed to update status: ${error.message}`);
    return;
  }

  // Ready for pickup trigger
  if (newStatus === 'Ready' && ticket) {
    const settings = getShopSettings();
    const cleanPhone = (ticket.customer_phone || '').replace(/[^0-9]/g, '');
    const balance = ticket.balance_due ?? 0;
    
    const message = `*REPAIR READY FOR PICKUP*\n\n` +
      `Hello *${ticket.customer_name}*,\n` +
      `Good news! Your *${ticket.brand_model}* (Ticket: ${ticket.ticket_code}) is fully repaired and tested.\n\n` +
      `*Balance Due:* ₦${Number(balance).toLocaleString()}\n` +
      `*Location:* ${settings.address}\n\n` +
      `Please collect within workshop hours. Thank you for choosing *${settings.name}*!`;

    const sendAlert = confirm(`Device marked READY. Would you like to send a WhatsApp pickup notification to ${ticket.customer_name}?`);
    if (sendAlert && cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  }

  loadTickets();
};

// 3. New Intake Submission
document.getElementById('intake-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerText = "Registering...";

  const ticketCode = `REP-${Math.floor(1000 + Math.random() * 9000)}`;
  const cost = parseFloat(inputCost.value) || 0;
  const deposit = parseFloat(inputDeposit.value) || 0;
  const balance = Math.max(0, cost - deposit);

  const customerName = document.getElementById('customer-name').value.trim();
  const customerPhone = document.getElementById('customer-phone').value.trim();
  const deviceType = document.getElementById('device-type').value;
  const brandModel = document.getElementById('brand-model').value.trim();
  const serialNumber = document.getElementById('serial-number').value.trim();
  const reportedFault = document.getElementById('reported-fault').value.trim();

  const payload = {
    ticket_code: ticketCode,
    customer_name: customerName,
    customer_phone: customerPhone,
    device_type: deviceType,
    brand_model: brandModel,
    serial_number: serialNumber,
    reported_fault: reportedFault,
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

  const message = `*${settings.name.toUpperCase()} - REPAIR INTAKE*\n\n` +
    `Hello *${payload.customer_name}*,\nYour device has been booked in.\n\n` +
    `*Ticket Code:* ${ticketCode}\n` +
    `*Device:* ${payload.brand_model}\n` +
    `*Serial/IMEI:* ${payload.serial_number}\n` +
    `*Fault Logged:* ${payload.reported_fault}\n` +
    `*Agreed Cost:* ₦${cost.toLocaleString()}\n` +
    `*Deposit Paid:* ₦${deposit.toLocaleString()}\n` +
    `*Balance Due:* ₦${balance.toLocaleString()}\n` +
    `*Warranty:* ${payload.warranty_days} Days (starts on collection)\n\n` +
    `_Notice: Devices not collected within 30 days after repair completion may be disposed of to recover service costs._`;

  document.getElementById('display-ticket-code').innerText = ticketCode;
  document.getElementById('btn-whatsapp').href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  document.getElementById('receipt-modal').classList.remove('hidden');

  document.getElementById('intake-form').reset();
  inputBalance.value = '';
  btn.disabled = false;
  btn.innerText = "Register Intake & Generate Receipt";

  loadTickets();
});

// 4. Print Tag Formatting
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

  const tag = document.getElementById('printable-tag');
  tag.classList.remove('hidden');
  window.print();
  tag.classList.add('hidden');
}

// 5. Warranty Audit
document.getElementById('btn-search').addEventListener('click', async () => {
  const query = document.getElementById('search-input').value.trim();
  const searchResult = document.getElementById('search-result');
  if (!query) return;

  searchResult.classList.remove('hidden');
  searchResult.className = "mt-4 p-4 rounded-lg border text-sm bg-slate-50 border-slate-200 text-slate-600";
  searchResult.innerHTML = "Auditing records...";

  const { data, error } = await db
    .from('repairs')
    .select('*')
    .or(`serial_number.ilike.%${query}%,ticket_code.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    searchResult.className = "mt-4 p-4 rounded-lg border text-sm bg-rose-50 border-rose-200 text-rose-700";
    searchResult.innerHTML = `<strong>Record Not Found:</strong> No repair history matches "${query}".`;
    return;
  }

  const record = data[0];
  const warrantyDays = record.warranty_days || 30;

  if (!record.collected_at) {
    searchResult.className = "mt-4 p-4 rounded-lg border text-sm bg-amber-50 border-amber-300 text-amber-900";
    searchResult.innerHTML = `
      <div class="space-y-1">
        <p class="font-bold text-base">${record.brand_model}</p>
        <p class="text-xs">Ticket: <span class="font-mono font-bold">${record.ticket_code}</span> | Serial: <span class="font-mono">${record.serial_number}</span></p>
        <p class="text-xs">Current Workshop Status: <strong>${record.status}</strong></p>
        <p class="text-xs font-semibold text-amber-800 pt-1">Warranty inactive: Device has not been collected yet.</p>
      </div>
    `;
    return;
  }

  const collectionDate = new Date(record.collected_at);
  const expiryDate = new Date(collectionDate.getTime() + warrantyDays * 24 * 60 * 60 * 1000);
  const isWarrantyValid = new Date() <= expiryDate;

  searchResult.className = `mt-4 p-4 rounded-lg border text-sm ${isWarrantyValid ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`;
  searchResult.innerHTML = `
    <div class="flex justify-between items-start">
      <div class="space-y-1">
        <p class="font-bold text-base">${record.brand_model}</p>
        <p class="text-xs">Customer: ${record.customer_name} (${record.customer_phone})</p>
        <p class="text-xs">Ticket: <span class="font-mono font-bold">${record.ticket_code}</span> | Serial: <span class="font-mono">${record.serial_number}</span></p>
        <p class="text-xs">Collected: ${collectionDate.toLocaleDateString()} | Expires: ${expiryDate.toLocaleDateString()}</p>
      </div>
      <div class="text-right">
        <span class="inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${isWarrantyValid ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}">
          ${isWarrantyValid ? 'Warranty Active' : 'Warranty Expired'}
        </span>
        <p class="text-xs mt-1 text-slate-500">${warrantyDays}-Day Term</p>
      </div>
    </div>
  `;
});

// 6. Settings Modal Handlers
const settingsModal = document.getElementById('settings-modal');
document.getElementById('btn-open-settings').addEventListener('click', () => {
  const current = getShopSettings();
  document.getElementById('setting-shop-name').value = current.name === 'Workshop Operations' ? '' : current.name;
  document.getElementById('setting-shop-address').value = current.address.includes('Workshop operations') ? '' : current.address;
  document.getElementById('setting-shop-phone').value = current.phone;
  settingsModal.classList.remove('hidden');
});

document.getElementById('btn-close-settings').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

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

// 7. Google AI Studio - Gemini Hardware Diagnostics
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
    geminiContent.innerHTML = `<span class="animate-pulse text-indigo-600 font-medium">Running Gemini diagnostic analysis for ${brandModel || deviceType}...</span>`;
    btnGeminiDiagnose.disabled = true;

    const prompt = `You are an elite electronics and computer repair technician workbench assistant.
Device: ${deviceType} - ${brandModel || 'Unspecified Model'}
Reported Symptoms / Fault: ${fault}

Provide a concise, practical bench diagnosis in under 120 words with 3 sections:
1. Probable Root Cause (e.g. blown capacitor, corrupted BIOS, damaged digitizer ribbon, PMIC failure)
2. Bench Test Steps (what multimeter test, voltage check, or isolation step to run first)
3. Estimated Repair Difficulty & Parts Needed`;

    try {
      // Reliable endpoint with automated fallback
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

      let response = await requestDiagnosis(primaryModel);
      if (!response.ok) {
        // If high demand/rate-limited, fallback immediately
        response = await requestDiagnosis(fallbackModel);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      const diagnosisText = result.candidates?.[0]?.content?.parts?.[0]?.text || "No diagnosis generated.";
      // Format simple line breaks and bold tags
      const formattedHtml = diagnosisText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

      geminiContent.innerHTML = formattedHtml;
    } catch (err) {
      geminiContent.innerHTML = `<span class="text-rose-600">Diagnosis error: ${err.message}</span>`;
    } finally {
      btnGeminiDiagnose.disabled = false;
    }
  });

  btnCloseGemini.addEventListener('click', () => {
    geminiBox.classList.add('hidden');
  });
}

// Init
updateShopHeader();
loadTickets();
