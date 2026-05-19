
/* ════════════════════════════════════════════════════════════════
   SmartLab — Pure Vanilla JS, no external dependencies
   Real-time status tracking, expiry notifications, live clock
   ════════════════════════════════════════════════════════════════ */

const API = '';  // same origin

/* ── State ────────────────────────────────────────────────────── */
let allEquipment = [];        // array of equipment objects from API
const notifiedExpired = new Set();  // booking IDs already notified as expired
let previousStatuses = {};    // track previous computed status per equipment

/* ── Toast notifications ──────────────────────────────────────── */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span>' +
    '<span>' + message + '</span>';

  // Adjust the progress bar animation to match the duration
  toast.style.setProperty('--toast-duration', duration + 'ms');
  const afterStyle = toast.querySelector('::after');
  toast.style.cssText += '';

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/* ── Show expiry banner (prominent, stays until dismissed) ────── */
function showExpiryBanner(equipName, bookingId) {
  const container = document.getElementById('expiry-banner-container');

  const banner = document.createElement('div');
  banner.className = 'expiry-banner';
  banner.id = 'expiry-' + bookingId;
  banner.innerHTML =
    '<span>⏰</span>' +
    '<span>Time slot for <strong>' + equipName + '</strong> is up! Please reclaim the equipment.</span>' +
    '<button class="dismiss-btn" onclick="this.parentElement.remove()">Dismiss</button>';

  container.appendChild(banner);

  // Also show a warning toast
  showToast('⏰ Time slot for ' + equipName + ' is up!', 'warning', 8000);
}

/* ── Helpers ──────────────────────────────────────────────────── */
function fmt(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

function buildDateTime(date, time) {
  return date + 'T' + time + ':00';
}

function priorityClass(year) {
  const map = { '4th Year': 'priority-4', '3rd Year': 'priority-3',
                '2nd Year': 'priority-2', '1st Year': 'priority-1' };
  return map[year] || 'priority-1';
}

/* ── Compute real-time status for an equipment ───────────────── */
function getComputedStatus(eq) {
  const now = new Date();
  const bookings = eq.bookings || [];

  let hasActive = false;
  let hasFuture = false;

  for (const b of bookings) {
    const start = new Date(b.start_time);
    const end = new Date(b.end_time);

    if (now >= start && now < end) {
      hasActive = true;
      break;
    }
    if (now < start) {
      hasFuture = true;
    }
  }

  if (hasActive) return 'IN USE';
  if (hasFuture) return 'BOOKED';
  return 'AVAILABLE';
}

/* ── Get the currently active booking (if any) ───────────────── */
function getActiveBooking(eq) {
  const now = new Date();
  for (const b of (eq.bookings || [])) {
    const start = new Date(b.start_time);
    const end = new Date(b.end_time);
    if (now >= start && now < end) return b;
  }
  // If no active booking, return the next upcoming one
  const future = (eq.bookings || [])
    .filter(b => new Date(b.start_time) > now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  return future.length > 0 ? future[0] : null;
}

/* ── Set loading state on Book button ────────────────────────── */
function setBookingLoading(isLoading) {
  const btn     = document.getElementById('btn-book');
  const spinner = document.getElementById('btn-spinner');
  const label   = document.getElementById('btn-label');
  btn.disabled  = isLoading;
  spinner.classList.toggle('show', isLoading);
  label.textContent = isLoading ? 'Booking…' : 'Book Equipment';
}

/* ── Live Clock ──────────────────────────────────────────────── */
function updateClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

/* ═══════════════════════════════════════════════════════════════
   FETCH & RENDER
   ═══════════════════════════════════════════════════════════════ */

async function loadAll() {
  try {
    const res  = await fetch(API + '/api/equipment');
    const data = await res.json();
    if (!data.success) throw new Error('Failed to load equipment');

    allEquipment = data.equipment.sort((a, b) => a.id.localeCompare(b.id));

    renderEquipmentCards();
    renderEquipmentDropdown();
    renderActiveBookings();
    renderWaitlist();
    renderStats();
  } catch (err) {
    showToast('Could not load equipment data. Is the server running?', 'error');
  }
}

/* ── Stats Bar ───────────────────────────────────────────────── */
function renderStats() {
  let available = 0, inuse = 0, booked = 0;

  allEquipment.forEach(eq => {
    const status = getComputedStatus(eq);
    if (status === 'IN USE') inuse++;
    else if (status === 'BOOKED') booked++;
    else available++;
  });

  document.getElementById('stat-total').textContent = allEquipment.length;
  document.getElementById('stat-available').textContent = available;
  document.getElementById('stat-inuse').textContent = inuse;
  document.getElementById('stat-booked').textContent = booked;
}

/* ── Equipment Cards ──────────────────────────────────────────── */
function renderEquipmentCards() {
  const grid  = document.getElementById('equipment-grid');
  const badge = document.getElementById('equip-count');

  badge.textContent = allEquipment.length + ' item' + (allEquipment.length !== 1 ? 's' : '');
  grid.innerHTML = '';

  if (allEquipment.length === 0) {
    grid.innerHTML = '<div class="empty-msg">No equipment found.</div>';
    return;
  }

  allEquipment.forEach((eq, idx) => {
    const status = getComputedStatus(eq);
    const cb     = getActiveBooking(eq);
    const wCount = eq.waitlist ? eq.waitlist.length : 0;

    const statusClass = status === 'IN USE' ? 'status-inuse' :
                        status === 'BOOKED' ? 'status-booked' : 'status-available';
    const statusLabel = status;

    let metaHtml = '';
    if (cb && status !== 'AVAILABLE') {
      metaHtml = '<div class="card-meta">' +
        '<div class="meta-row"><strong>USN:</strong> ' + cb.usn + '</div>' +
        '<div class="meta-row"><strong>Slot:</strong> ' + fmt(cb.start_time) + ' → ' + fmt(cb.end_time) + '</div>' +
        '</div>';
    }

    let actionsHtml = '';
    if (cb && status !== 'AVAILABLE') {
      actionsHtml = '<div class="card-actions">' +
        '<button class="btn-cancel" ' +
          'data-booking-id="' + cb.booking_id + '" ' +
          'data-equipment-id="' + eq.id + '">' +
          'Cancel Booking' +
        '</button>' +
        (wCount > 0 ? '<span class="waitlist-badge">⏳ ' + wCount + ' waiting</span>' : '') +
        '</div>';
    } else if (wCount > 0) {
      actionsHtml = '<div class="card-actions">' +
        '<span class="waitlist-badge">⏳ ' + wCount + ' waiting</span>' +
        '</div>';
    }

    const card = document.createElement('div');
    card.className = 'equipment-card';
    card.id = 'card-' + eq.id;
    card.style.animationDelay = (idx * 0.05) + 's';
    card.innerHTML =
      '<div class="card-top">' +
        '<div>' +
          '<div class="card-name">' + eq.name + '</div>' +
          '<div class="card-id">' + eq.id + '</div>' +
        '</div>' +
        '<span class="status-badge ' + statusClass + '">' +
          statusLabel +
        '</span>' +
      '</div>' +
      metaHtml +
      actionsHtml;

    grid.appendChild(card);
  });
}

/* ── Equipment Dropdown in form ───────────────────────────────── */
function renderEquipmentDropdown() {
  const sel = document.getElementById('equipment-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Select Equipment —</option>';
  allEquipment.forEach(eq => {
    const opt = document.createElement('option');
    opt.value = eq.id;
    opt.textContent = eq.name + ' (' + eq.id + ')';
    if (eq.id === cur) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ── Active Bookings list (right panel) ───────────────────────── */
function renderActiveBookings() {
  const list = document.getElementById('active-bookings-list');
  list.innerHTML = '';

  const allBookings = [];
  allEquipment.forEach(eq => {
    (eq.bookings || []).forEach(b => {
      allBookings.push({ ...b, equipName: eq.name });
    });
  });

  if (allBookings.length === 0) {
    list.innerHTML = '<div class="empty-msg">No active bookings yet.</div>';
    return;
  }

  allBookings.sort((a, b) => a.start_time.localeCompare(b.start_time));

  allBookings.forEach(b => {
    const item = document.createElement('div');
    item.className = 'booking-item';
    item.innerHTML =
      '<div class="bi-top">' +
        '<span class="bi-name">' + b.usn + '</span>' +
        '<span class="bi-id">' + b.booking_id + '</span>' +
      '</div>' +
      '<div class="bi-slot">' + b.equipName + ' · ' + fmt(b.start_time) + ' → ' + fmt(b.end_time) + '</div>';
    list.appendChild(item);
  });
}

/* ── Waitlist table ───────────────────────────────────────────── */
function renderWaitlist() {
  const tbody = document.getElementById('waitlist-tbody');
  tbody.innerHTML = '';

  const allWaiting = [];
  allEquipment.forEach(eq => {
    (eq.waitlist || []).forEach(w => {
      allWaiting.push({ ...w, equipName: eq.name });
    });
  });

  if (allWaiting.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No one on the waitlist.</td></tr>';
    return;
  }

  allWaiting.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);

  allWaiting.forEach((w, idx) => {
    const rank = idx + 1;
    const tr   = document.createElement('tr');
    if (rank === 1) tr.className = 'rank-1';
    tr.innerHTML =
      '<td>' + (rank === 1 ? '<span class="rank-gold">🥇 1</span>' : rank) + '</td>' +
      '<td>' + w.usn + '</td>' +
      '<td>' + w.equipName + '</td>' +
      '<td>' + fmt(w.start_time) + ' → ' + fmt(w.end_time) + '</td>' +
      '<td><span class="priority-pill ' + priorityClass(w.priority_year) + '">' + w.priority_year + '</span></td>';
    tbody.appendChild(tr);
  });
}

/* ═══════════════════════════════════════════════════════════════
   REAL-TIME STATUS MONITORING (runs every second)
   ═══════════════════════════════════════════════════════════════ */

function checkStatusChanges() {
  const now = new Date();

  allEquipment.forEach(eq => {
    const currentStatus = getComputedStatus(eq);
    const prevStatus = previousStatuses[eq.id];

    // Detect status transitions
    if (prevStatus && prevStatus !== currentStatus) {
      // Re-render on any transition
      renderEquipmentCards();
      renderStats();

      if (prevStatus === 'BOOKED' && currentStatus === 'IN USE') {
        showToast('⚡ ' + eq.name + ' is now IN USE', 'info');
      }
    }

    previousStatuses[eq.id] = currentStatus;

    // Check for expired bookings
    (eq.bookings || []).forEach(b => {
      const endTime = new Date(b.end_time);
      const diff = now - endTime;
      // Fire if booking ended within last 2 seconds and not yet notified
      if (diff >= 0 && diff < 2000 && !notifiedExpired.has(b.booking_id)) {
        notifiedExpired.add(b.booking_id);
        showExpiryBanner(eq.name, b.booking_id);
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   ACTIONS
   ═══════════════════════════════════════════════════════════════ */

/* ── Book Equipment ───────────────────────────────────────────── */
document.getElementById('booking-form').addEventListener('submit', async function(e) {
  e.preventDefault();

  const usn          = document.getElementById('usn').value.trim();
  const equipmentId  = document.getElementById('equipment-select').value;
  const date         = document.getElementById('booking-date').value;
  const startT       = document.getElementById('start-time').value;
  const endT         = document.getElementById('end-time').value;
  const priorityYear = document.getElementById('priority-year').value;

  if (!usn) { showToast('Please enter a USN.', 'error'); return; }
  if (!equipmentId) { showToast('Please select equipment.', 'error'); return; }
  if (!date) { showToast('Please pick a date.', 'error'); return; }
  if (!startT || !endT) { showToast('Please set start and end time.', 'error'); return; }
  if (startT >= endT) { showToast('End time must be after start time.', 'error'); return; }

  const startISO = buildDateTime(date, startT);
  const endISO   = buildDateTime(date, endT);

  setBookingLoading(true);

  try {
    const res  = await fetch(API + '/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usn,
        equipment_id: equipmentId,
        start_time: startISO,
        end_time: endISO,
        priority_year: priorityYear
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Booking confirmed! ID: ' + data.booking_id, 'success');
      document.getElementById('booking-form').reset();
      document.getElementById('booking-date').value = new Date().toISOString().split('T')[0];
      await loadAll();
    } else if (data.reason === 'CONFLICT') {
      showConflictModal(usn, equipmentId, startISO, endISO, priorityYear);
    } else {
      showToast('Booking failed: ' + (data.reason || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Network error. Please check the server.', 'error');
  } finally {
    setBookingLoading(false);
  }
});

/* ── Custom modal helper ──────────────────────────────────────── */
function makeModal(titleText, bodyText, yesLabel, yesBg, onYes) {
  const old = document.getElementById('sl-modal');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sl-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

  const box = document.createElement('div');
  box.style.cssText = 'background:#1e293b;border-radius:16px;padding:32px 36px;max-width:420px;width:90%;box-shadow:0 24px 64px rgba(0,0,0,0.5);text-align:center;border:1px solid rgba(255,255,255,0.08);';

  const title = document.createElement('p');
  title.textContent = titleText;
  title.style.cssText = 'font-size:1.05rem;color:#f1f5f9;font-weight:700;margin-bottom:10px;';

  const body = document.createElement('p');
  body.textContent = bodyText;
  body.style.cssText = 'font-size:0.875rem;color:#94a3b8;margin-bottom:24px;line-height:1.55;';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;justify-content:center;';

  const noBtn = document.createElement('button');
  noBtn.textContent = 'No Thanks';
  noBtn.style.cssText = 'padding:10px 26px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-weight:600;cursor:pointer;font-size:0.9rem;font-family:Inter,sans-serif;';
  noBtn.addEventListener('mouseover', () => noBtn.style.background = 'rgba(255,255,255,0.08)');
  noBtn.addEventListener('mouseout',  () => noBtn.style.background = 'rgba(255,255,255,0.05)');

  const yesBtn = document.createElement('button');
  yesBtn.textContent = yesLabel;
  yesBtn.style.cssText = 'padding:10px 26px;border-radius:8px;border:none;font-weight:700;cursor:pointer;font-size:0.9rem;font-family:Inter,sans-serif;color:#fff;';
  yesBtn.style.setProperty('background', yesBg, 'important');
  yesBtn.addEventListener('mouseover', () => yesBtn.style.opacity = '0.88');
  yesBtn.addEventListener('mouseout',  () => yesBtn.style.opacity = '1');

  row.appendChild(noBtn);
  row.appendChild(yesBtn);
  box.appendChild(title);
  box.appendChild(body);
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  yesBtn.addEventListener('click', () => { overlay.remove(); onYes(); });
  noBtn.addEventListener('click',  () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* ── Conflict modal → offer waitlist ─────────────────────────── */
function showConflictModal(usn, equipmentId, startISO, endISO, priorityYear) {
  makeModal(
    '⚡ Time Slot Conflict',
    'That slot is already booked. Would you like to join the priority waitlist? ' +
    'Your academic year determines your queue position.',
    'Join Waitlist',
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    function() { joinWaitlist(usn, equipmentId, startISO, endISO, priorityYear); }
  );
}

/* ── Join Waitlist ────────────────────────────────────────────── */
async function joinWaitlist(usn, equipmentId, startISO, endISO, priorityYear) {
  try {
    const res  = await fetch(API + '/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usn,
        equipment_id: equipmentId,
        start_time: startISO,
        end_time: endISO,
        priority_year: priorityYear
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Added to waitlist with ' + priorityYear + ' priority!', 'info');
      document.getElementById('booking-form').reset();
      document.getElementById('booking-date').value = new Date().toISOString().split('T')[0];
      await loadAll();
    } else {
      showToast('Could not join waitlist: ' + (data.reason || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Network error joining waitlist.', 'error');
  }
}

/* ── Cancel Booking — event delegation ───────────────────────── */
document.getElementById('equipment-grid').addEventListener('click', function(e) {
  const btn = e.target.closest('.btn-cancel');
  if (!btn) return;

  const bookingId   = btn.getAttribute('data-booking-id');
  const equipmentId = btn.getAttribute('data-equipment-id');
  if (!bookingId || !equipmentId) return;

  makeModal(
    '🗑️ Cancel Booking?',
    'This will free up the slot. If someone is on the waitlist, the highest-priority student will be promoted automatically.',
    'Yes, Cancel',
    '#ef4444',
    async function() {
      btn.disabled = true;
      btn.textContent = 'Cancelling…';
      try {
        const res  = await fetch('/api/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, equipment_id: equipmentId })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Booking cancelled successfully!', 'success');
          await loadAll();
        } else {
          showToast('Cancel failed: ' + (data.reason || 'Unknown error'), 'error');
          btn.disabled = false;
          btn.textContent = 'Cancel Booking';
        }
      } catch (err) {
        showToast('Network error: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Cancel Booking';
      }
    }
  );
});

/* ═══════════════════════════════════════════════════════════════
   INIT — Clock, status monitor, load data
   ═══════════════════════════════════════════════════════════════ */
(function init() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('booking-date').value = today;

  // Start live clock
  updateClock();
  setInterval(updateClock, 1000);

  // Start real-time status monitor (every second)
  setInterval(checkStatusChanges, 1000);

  // Load data initially and refresh every 30s
  loadAll();
  setInterval(loadAll, 30000);
})();
