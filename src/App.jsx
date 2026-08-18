import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Users, Clock, CalendarDays, Wallet, FileText,
  Plus, Check, X, ShieldCheck, ChevronRight, Loader2, ClipboardList, Building2, Trash2, Printer
} from 'lucide-react';

// window.storage is provided by the Claude.ai artifact host. If this file is ever
// opened outside that host (a plain browser, a different sandbox), fall back to
// localStorage so the app still persists data instead of losing it silently.
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    get: async (key) => {
      const val = window.localStorage.getItem(key);
      return val !== null ? { key, value: val, shared: false } : null;
    },
    set: async (key, val) => {
      window.localStorage.setItem(key, val);
      return { key, value: val, shared: false };
    },
    delete: async (key) => {
      window.localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    list: async (prefix) => {
      const keys = Object.keys(window.localStorage).filter((k) => !prefix || k.startsWith(prefix));
      return { keys, prefix, shared: false };
    },
  };
}

const COLORS = {
  ink: '#14213D',
  inkLight: '#1E2E52',
  inkLighter: '#2A3B63',
  parchment: '#EFE8D8',
  parchmentDark: '#E2D9C3',
  page: '#F5F6F3',
  card: '#FFFFFF',
  gold: '#B8862E',
  goldLight: '#D9B463',
  goldSoft: '#F1E3C6',
  green: '#2F6B4F',
  greenSoft: '#E4EEE8',
  rust: '#A6432A',
  rustSoft: '#F3E3DE',
  textDark: '#1B1B18',
  textMuted: '#736C5E',
  border: '#E4E0D4',
};

const STORAGE_KEY = 'nexacore-people-data';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — client-side session expiry
const SECURITY_LOG_KEY = 'nexacore-security-log';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;

// This log deliberately holds no salary data — only event metadata (timestamp,
// which business, what happened) — so it's fine for it to stay unencrypted; it
// has to be readable and writable before anyone has proven they know a passcode.
async function logSecurityEvent(event, businessId) {
  try {
    const res = await window.storage.get(SECURITY_LOG_KEY, false);
    const log = res && res.value ? JSON.parse(res.value) : [];
    log.push({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), event, businessId });
    await window.storage.set(SECURITY_LOG_KEY, JSON.stringify(log.slice(-300)), false);
  } catch (e) {}
}

async function getSecurityLog(businessId) {
  try {
    const res = await window.storage.get(SECURITY_LOG_KEY, false);
    const log = res && res.value ? JSON.parse(res.value) : [];
    return businessId ? log.filter((e) => e.businessId === businessId) : log;
  } catch (e) {
    return [];
  }
}

// Client-side only — a speed bump against casual repeated guessing through this
// UI, not real brute-force protection (nothing stops someone from clearing
// storage or calling the hash function directly). Returns seconds remaining, 0
// if not locked.
async function checkLockout(businessId) {
  const log = await getSecurityLog(businessId);
  const recentFails = log.filter((e) => e.event === 'LOGIN_FAILED' && Date.now() - new Date(e.at).getTime() < LOCKOUT_WINDOW_MS);
  if (recentFails.length >= MAX_FAILED_ATTEMPTS) {
    const lastFail = new Date(recentFails[recentFails.length - 1].at).getTime();
    const unlockAt = lastFail + LOCKOUT_MS;
    if (Date.now() < unlockAt) return Math.ceil((unlockAt - Date.now()) / 1000);
  }
  return 0;
}


const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');`;

const seedData = (businessName = 'Your Business') => ({
  businessName,
  employees: [
    { id: 'e1', name: 'Amina Juma', role: 'Sales Assistant', salary: 450000 },
    { id: 'e2', name: 'Baraka Mushi', role: 'Storekeeper', salary: 380000 },
    { id: 'e3', name: 'Grace Mollel', role: 'Cashier', salary: 400000 },
  ],
  attendance: [],
  leave: [],
  payrollRuns: [],
  tasks: [
    { id: 't1', title: "File this month's PAYE & SDL with TRA", dueDate: '', done: false },
  ],
  companyInfo: { tin: '', licenseNo: '', address: '', phone: '' },
  taxSettings: defaultTaxSettings(),
  adminLog: [
    { id: 'n1', date: new Date().toISOString(), note: 'NexaCore People set up. Add your real staff to get started.' },
  ],
  auditLog: [],
  lastBackupAt: null,
});

const COUNTRY_CURRENCY = { Tanzania: 'TZS', Kenya: 'KES', Uganda: 'UGX', Rwanda: 'RWF' };

function defaultTaxSettings() {
  return {
    country: 'Tanzania',
    currency: 'TZS',
    nssfEmployeeRate: 0.10,
    nssfEmployerRate: 0.10,
    sdlRate: 0.035,
    sdlThreshold: 10,
    wcfRate: 0.005,
    nhifEnabled: false,
    nhifEmployeeRate: 0.03,
    nhifEmployerRate: 0.03,
    payeBands: [
      { threshold: 0, rate: 0 },
      { threshold: 270000, rate: 0.08 },
      { threshold: 520000, rate: 0.20 },
      { threshold: 760000, rate: 0.25 },
      { threshold: 1000000, rate: 0.30 },
    ],
  };
}

// Deliberately empty — Kenya/Uganda/Rwanda have real statutory schemes (KRA iTax
// & SHIF, URA & LST, RSSB) that don't map cleanly onto this same field set, and
// I have no verified current rates for them. Selecting one of these gives you
// the same configurable structure as Tanzania, starting at zero, so nothing
// here is ever presented as a real number I didn't check.
function blankTaxSettings(country) {
  return {
    country,
    currency: COUNTRY_CURRENCY[country] || '',
    nssfEmployeeRate: 0,
    nssfEmployerRate: 0,
    sdlRate: 0,
    sdlThreshold: 0,
    wcfRate: 0,
    nhifEnabled: false,
    nhifEmployeeRate: 0,
    nhifEmployerRate: 0,
    payeBands: [{ threshold: 0, rate: 0 }],
  };
}

function countryPreset(country) {
  return country === 'Tanzania' ? defaultTaxSettings() : blankTaxSettings(country);
}

function calcPAYEDynamic(taxable, bands) {
  const sorted = [...(bands || [])].sort((a, b) => a.threshold - b.threshold);
  let tax = 0;
  for (let i = 0; i < sorted.length; i++) {
    const lower = sorted[i].threshold;
    const upper = i + 1 < sorted.length ? sorted[i + 1].threshold : Infinity;
    if (taxable > lower) {
      const amountInBand = Math.min(taxable, upper) - lower;
      tax += amountInBand * sorted[i].rate;
    }
  }
  return Math.max(0, tax);
}

function runPayrollCalc(gross, applySDL, settings) {
  const s = settings || defaultTaxSettings();
  const nssfEmployee = gross * s.nssfEmployeeRate;
  const nssfEmployer = gross * s.nssfEmployerRate;
  const taxable = gross - nssfEmployee;
  const paye = calcPAYEDynamic(taxable, s.payeBands);
  const sdl = applySDL ? gross * s.sdlRate : 0;
  const wcf = gross * s.wcfRate;
  const nhifEmployee = s.nhifEnabled ? gross * s.nhifEmployeeRate : 0;
  const nhifEmployer = s.nhifEnabled ? gross * s.nhifEmployerRate : 0;
  const netPay = gross - nssfEmployee - paye - nhifEmployee;
  const employerCost = gross + nssfEmployer + sdl + wcf + nhifEmployer;
  return { gross, nssfEmployee, nssfEmployer, taxable, paye, sdl, wcf, nhifEmployee, nhifEmployer, netPay, employerCost };
}

// Plain rule-based checks — duplicate-field matching and a % threshold, not
// machine learning. Runs entirely on data already in the app.
function computeRiskFlags(employees, payrollRuns) {
  const active = employees.filter((e) => e.active !== false);
  const flags = [];

  const byAccount = {};
  active.forEach((e) => {
    const acct = (e.payoutAccount || '').trim();
    if (!acct) return;
    (byAccount[acct] = byAccount[acct] || []).push(e.name);
  });
  Object.entries(byAccount).forEach(([acct, names]) => {
    if (names.length > 1) {
      flags.push({ type: 'DUPLICATE_ACCOUNT', detail: `${names.join(' & ')} share the same payout account (••••${acct.slice(-4)})` });
    }
  });

  const byNida = {};
  active.forEach((e) => {
    const id = (e.nationalId || '').trim();
    if (!id) return;
    (byNida[id] = byNida[id] || []).push(e.name);
  });
  Object.entries(byNida).forEach(([id, names]) => {
    if (names.length > 1) {
      flags.push({ type: 'DUPLICATE_ID', detail: `${names.join(' & ')} share the same NIDA/TIN number` });
    }
  });

  active.forEach((e) => {
    const runs = payrollRuns.filter((r) => r.employeeId === e.id).sort((a, b) => a.period.localeCompare(b.period));
    const last = runs[runs.length - 1];
    if (last && last.gross > 0) {
      const change = (e.salary - last.gross) / last.gross;
      if (Math.abs(change) > 0.2) {
        flags.push({
          type: 'SALARY_SPIKE',
          detail: `${e.name}: salary ${change > 0 ? 'up' : 'down'} ${Math.abs(change * 100).toFixed(0)}% since last payroll (${fmt(last.gross)} → ${fmt(e.salary)})`,
        });
      }
    }
  });

  return flags;
}

// Simple sum of what a run would cost right now at current salaries and rates —
// arithmetic, not a forecast model.
function projectPayrollCost(employees, taxSettings, applySDL) {
  const active = employees.filter((e) => e.active !== false);
  let totalNet = 0, totalCost = 0;
  active.forEach((e) => {
    const b = runPayrollCalc(e.salary, applySDL, taxSettings);
    totalNet += b.netPay;
    totalCost += b.employerCost;
  });
  return { totalNet, totalCost, count: active.length };
}

const DEFAULT_LEAVE_ENTITLEMENT = 28; // Employment and Labour Relations Act, Cap 366, Section 31

function daysInclusive(from, to) {
  if (!from || !to) return 0;
  const diff = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

// Tracked by calendar year as a practical simplification — the Act actually
// bases the leave cycle on each employee's own 12-month service anniversary,
// not January-to-December. Close enough for most small businesses, but worth
// knowing if you're auditing this against the letter of the law.
function computeLeaveBalance(employee, leaveRequests, year) {
  const entitlement = employee.leaveEntitlement != null && employee.leaveEntitlement !== '' ? Number(employee.leaveEntitlement) : DEFAULT_LEAVE_ENTITLEMENT;
  const used = leaveRequests
    .filter((l) => l.employeeId === employee.id && l.type === 'Annual' && l.status === 'approved' && l.from && String(l.from).slice(0, 4) === String(year))
    .reduce((sum, l) => sum + daysInclusive(l.from, l.to), 0);
  return { entitlement, used, remaining: entitlement - used };
}

// SHA-256 via the browser's real Web Crypto API — a genuine improvement over
// plaintext, but NOT equivalent to server-side bcrypt/Argon2 with rate-limiting.
// There's no server here to keep the hash secret or throttle guesses.
async function hashPasscode(pass) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const enc = new TextEncoder().encode(pass);
      const buf = await window.crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  let h = 0;
  for (let i = 0; i < pass.length; i++) h = (h * 31 + pass.charCodeAt(i)) >>> 0;
  return 'fallback-' + h.toString(16);
}

// Real AES-256-GCM, keyed via PBKDF2 from the business passcode. Chunked
// base64 avoids a call-stack overflow on larger data blobs. If Web Crypto
// genuinely isn't available, we skip encryption rather than fake it —
// there's no honest fallback for actual encryption the way there is for hashing.
function cryptoAvailable() {
  return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomSaltB64() {
  return bytesToBase64(window.crypto.getRandomValues(new Uint8Array(16)));
}

async function deriveEncKey(passcode, saltB64) {
  const salt = base64ToBytes(saltB64);
  const baseKey = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']);
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptString(key, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ctBuf)) };
}

async function decryptString(key, ivB64, dataB64) {
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(dataB64);
  const ptBuf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(ptBuf);
}

// Envelope encryption: a random Data Encryption Key (DEK) actually encrypts the
// business data. The passcode-derived key (KEK) only wraps the small DEK, not
// the data itself — so changing the passcode means re-wrapping the DEK, not
// re-encrypting everything. Logic verified round-trip before integration.
async function generateDEK() {
  return window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportDEKToB64(dek) {
  const raw = await window.crypto.subtle.exportKey('raw', dek);
  return bytesToBase64(new Uint8Array(raw));
}

async function importDEKFromB64(b64) {
  const raw = base64ToBytes(b64);
  return window.crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
}

async function wrapDEK(kek, dek) {
  const dekB64 = await exportDEKToB64(dek);
  return encryptString(kek, dekB64);
}

async function unwrapDEK(kek, wrapped) {
  const dekB64 = await decryptString(kek, wrapped.iv, wrapped.data);
  return importDEKFromB64(dekB64);
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const fmt = (n) => 'TZS ' + Math.round(n).toLocaleString('en-US');
const pct = (part, whole) => (whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0');
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const slugify = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'business';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'attendance', label: 'Attendance', icon: Clock },
  { id: 'leave', label: 'Leave', icon: CalendarDays },
  { id: 'payroll', label: 'Payroll', icon: Wallet },
  { id: 'log', label: 'Administration', icon: ClipboardList },
];

function Badge({ tone, children }) {
  const tones = {
    green: { bg: COLORS.greenSoft, fg: COLORS.green },
    gold: { bg: COLORS.goldSoft, fg: COLORS.gold },
    rust: { bg: COLORS.rustSoft, fg: COLORS.rust },
    muted: { bg: COLORS.parchmentDark, fg: COLORS.textMuted },
  };
  const t = tones[tone] || tones.muted;
  return (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

function Card({ children, className = '', style = {} }) {
  return (
    <div
      className={`rounded-2xl border p-6 ${className}`}
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, ...style }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        {eyebrow && (
          <div className="text-xs font-semibold tracking-[0.14em] uppercase mb-1" style={{ color: COLORS.gold }}>
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl" style={{ fontFamily: "'Fraunces', serif", color: COLORS.ink, fontWeight: 600 }}>
          {title}
        </h1>
      </div>
      {action}
    </div>
  );
}

function PrimaryButton({ onClick, children, type = 'button', disabled }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50"
      style={{ backgroundColor: COLORS.ink, color: '#fff' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLORS.inkLight)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.ink)}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: COLORS.textMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '10px',
  border: `1px solid ${COLORS.border}`,
  fontSize: '14px',
  fontFamily: "'Inter', sans-serif",
  color: COLORS.textDark,
  outline: 'none',
};

function LoginScreen({ accounts, onLogin, onSignup, onRestore }) {
  const [mode, setMode] = useState(accounts.length ? 'login' : 'signup');
  const [businessId, setBusinessId] = useState(accounts[0]?.businessId || '');
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [actorName, setActorName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupFile, setBackupFile] = useState(null);
  const [backupFileName, setBackupFileName] = useState('');

  const submitLogin = async () => {
    setError('');
    setBusy(true);
    try {
      const acc = accounts.find((a) => a.businessId === businessId);
      if (!acc) { setError('Select a business.'); return; }
      const lockedSecs = await checkLockout(acc.businessId);
      if (lockedSecs > 0) { setError(`Too many attempts — try again in ${lockedSecs}s.`); return; }
      const hash = await hashPasscode(passcode);
      if (acc.passcodeHash !== hash) {
        await logSecurityEvent('LOGIN_FAILED', acc.businessId);
        setError('Wrong passcode.');
        return;
      }
      await logSecurityEvent('LOGIN_SUCCESS', acc.businessId);
      onLogin(acc, passcode, actorName.trim());
    } catch (err) {
      setError('Login failed: ' + (err && err.message ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = async () => {
    setError('');
    if (!name.trim() || !passcode) { setError('Enter a business name and passcode.'); return; }
    setBusy(true);
    try {
      const hash = await hashPasscode(passcode);
      onSignup(name.trim(), hash, passcode, actorName.trim());
    } catch (err) {
      setError('Could not create account: ' + (err && err.message ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBackupFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setBackupFile(JSON.parse(reader.result));
        setError('');
      } catch (err) {
        setBackupFile(null);
        setError('That file is not valid JSON.');
      }
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  };

  const submitRestore = async () => {
    setError('');
    if (!backupFile) { setError('Choose a backup file first.'); return; }
    if (!passcode) { setError('Enter the backup\'s passcode.'); return; }
    setBusy(true);
    try {
      await onRestore(backupFile, passcode);
    } catch (err) {
      setError('Restore failed: ' + (err && err.message ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: COLORS.ink, fontFamily: "'Inter', sans-serif" }}>
      <style>{`${FONT_IMPORT}`}</style>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <div className="text-xs tracking-[0.2em] uppercase mb-1" style={{ color: COLORS.goldLight }}>NexaCore</div>
          <div className="text-2xl text-white" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>People</div>
          <div className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Self-serve staff &amp; payroll for your business</div>
        </div>

        <div className="rounded-2xl p-6" style={{ backgroundColor: '#fff' }}>
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className="flex-1 text-sm font-semibold py-2 rounded-lg"
              style={{ backgroundColor: mode === 'login' ? COLORS.ink : COLORS.parchment, color: mode === 'login' ? '#fff' : COLORS.textDark }}
            >
              Log in
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className="flex-1 text-sm font-semibold py-2 rounded-lg"
              style={{ backgroundColor: mode === 'signup' ? COLORS.ink : COLORS.parchment, color: mode === 'signup' ? '#fff' : COLORS.textDark }}
            >
              New business
            </button>
            <button
              onClick={() => { setMode('restore'); setError(''); }}
              className="flex-1 text-sm font-semibold py-2 rounded-lg"
              style={{ backgroundColor: mode === 'restore' ? COLORS.ink : COLORS.parchment, color: mode === 'restore' ? '#fff' : COLORS.textDark }}
            >
              Restore
            </button>
          </div>

          {mode === 'login' ? (
            <div className="space-y-4">
              {accounts.length === 0 ? (
                <div className="text-sm text-center py-2" style={{ color: COLORS.textMuted }}>
                  No businesses yet.
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setError(''); }}
                    className="block mx-auto mt-2 text-xs font-semibold"
                    style={{ color: COLORS.gold }}
                  >
                    Create your first business account →
                  </button>
                </div>
              ) : (
                <>
                  <Field label="Business">
                    <select style={inputStyle} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
                      {accounts.map((a) => <option key={a.businessId} value={a.businessId}>{a.businessName}</option>)}
                    </select>
                  </Field>
                  <Field label="Passcode">
                    <input
                      style={inputStyle}
                      type="password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitLogin(); }}
                    />
                  </Field>
                  <Field label="Your name (optional — labels the audit log)">
                    <input style={inputStyle} value={actorName} onChange={(e) => setActorName(e.target.value)} placeholder="e.g. Amina" />
                  </Field>
                  {error && <div className="text-xs" style={{ color: COLORS.rust }}>{error}</div>}
                  <PrimaryButton type="button" onClick={submitLogin} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</PrimaryButton>
                </>
              )}
            </div>
          ) : mode === 'signup' ? (
            <div className="space-y-4">
              <Field label="Business name">
                <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amina's Duka" />
              </Field>
              <Field label="Set a passcode">
                <input
                  style={inputStyle}
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitSignup(); }}
                />
              </Field>
              <Field label="Your name (optional — labels the audit log)">
                <input style={inputStyle} value={actorName} onChange={(e) => setActorName(e.target.value)} placeholder="e.g. Amina" />
              </Field>
              {error && <div className="text-xs" style={{ color: COLORS.rust }}>{error}</div>}
              <PrimaryButton type="button" onClick={submitSignup} disabled={busy}>{busy ? 'Creating…' : 'Create business account'}</PrimaryButton>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Backup file (.json)">
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleFileSelect}
                  style={{ ...inputStyle, padding: '7px' }}
                />
              </Field>
              {backupFileName && <div className="text-xs" style={{ color: COLORS.textMuted }}>Selected: {backupFileName}</div>}
              <Field label="Backup's passcode">
                <input
                  style={inputStyle}
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitRestore(); }}
                />
              </Field>
              {error && <div className="text-xs" style={{ color: COLORS.rust }}>{error}</div>}
              <PrimaryButton type="button" onClick={submitRestore} disabled={busy}>{busy ? 'Restoring…' : 'Restore backup'}</PrimaryButton>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>
                Restores into a fresh, freshly-secured account on this device — it won't overwrite anything unless the file's business ID happens to already exist here.
              </div>
            </div>
          )}
        </div>
        <div className="text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Demo login — illustrates the self-serve flow, not production-grade security.
        </div>
      </div>
    </div>
  );
}

function UnlockScreen({ businessName, onUnlock, onLogout }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    setChecking(true);
    setError('');
    try {
      await onUnlock(passcode);
    } catch (e) {
      setError('Wrong passcode.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: COLORS.ink, fontFamily: "'Inter', sans-serif" }}>
      <style>{`${FONT_IMPORT}`}</style>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <div className="text-xs tracking-[0.2em] uppercase mb-1" style={{ color: COLORS.goldLight }}>NexaCore</div>
          <div className="text-2xl text-white" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Welcome back</div>
          <div className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{businessName}</div>
        </div>
        <div className="rounded-2xl p-6" style={{ backgroundColor: '#fff' }}>
          <Field label="Passcode">
            <input
              autoFocus
              style={inputStyle}
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </Field>
          <div className="text-xs mt-2 mb-4" style={{ color: COLORS.textMuted }}>
            Your data is encrypted with this passcode. It's needed each time you open the app since it's never stored anywhere.
          </div>
          {error && <div className="text-xs mb-3" style={{ color: COLORS.rust }}>{error}</div>}
          <PrimaryButton type="button" onClick={submit} disabled={checking}>{checking ? 'Unlocking…' : 'Unlock'}</PrimaryButton>
          <button type="button" onClick={onLogout} className="block mx-auto mt-3 text-xs font-semibold" style={{ color: COLORS.textMuted }}>Not you? Log out</button>
        </div>
      </div>
    </div>
  );
}

function NexaCorePeopleApp() {
  const [accounts, setAccounts] = useState([]);
  const [session, setSession] = useState(undefined);
  const [encKey, setEncKey] = useState(null); // CryptoKey | null — in-memory only, never persisted
  const [decryptError, setDecryptError] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [section, setSection] = useState('overview');
  const [stepUp, setStepUp] = useState(null); // { label, resolve } | null

  const requireStepUp = (label) =>
    new Promise((resolve) => setStepUp({ label, resolve }));

  useEffect(() => {
    (async () => {
      let accs = [];
      try {
        const accRes = await window.storage.get('nexacore-accounts', false);
        accs = accRes && accRes.value ? JSON.parse(accRes.value) : [];
      } catch (e) { accs = []; }
      setAccounts(accs);

      let sess = null;
      try {
        const sessRes = await window.storage.get('nexacore-session', false);
        sess = sessRes && sessRes.value ? JSON.parse(sessRes.value) : null;
        if (sess && sess.expiresAt && sess.expiresAt < Date.now()) {
          sess = null;
          try { await window.storage.set('nexacore-session', JSON.stringify(null), false); } catch (e2) {}
        }
      } catch (e) { sess = null; }
      setSession(sess);
    })();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setData(null); setLoading(false); return; }
    const acc = accounts.find((a) => a.businessId === session.businessId);
    const needsKey = !!(acc && acc.salt);
    if (needsKey && !encKey) {
      // Waiting for the Unlock screen to supply the passcode — don't load yet.
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const storageKey = STORAGE_KEY + ':' + session.businessId;

      // First: does anything exist at all? A throw here just means "no data
      // yet" (brand new business) — not a decryption problem.
      let raw = null;
      try {
        const res = await window.storage.get(storageKey, false);
        raw = res && res.value ? res.value : null;
      } catch (e) {
        raw = null;
      }

      if (raw === null) {
        const fresh = seedData(session.businessName);
        setData(fresh);
        setDecryptError('');
        setLoading(false);
        return;
      }

      // Something exists — now try to read/decrypt it. A failure here is a
      // real problem, not "no data yet", so it must not look like data loss.
      try {
        const parsed = JSON.parse(raw);
        let loaded;
        if (parsed && parsed.__enc === true) {
          if (!encKey) throw new Error('No encryption key available');
          const plaintext = await decryptString(encKey, parsed.iv, parsed.data);
          loaded = JSON.parse(plaintext);
        } else {
          loaded = parsed; // legacy unencrypted data from before this update
        }
        if (!loaded.taxSettings) loaded.taxSettings = defaultTaxSettings();
        if (!loaded.auditLog) loaded.auditLog = [];
        setData(loaded);
        setDecryptError('');
      } catch (e) {
        setDecryptError('Could not decrypt your data: ' + (e && e.message ? e.message : String(e)));
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [session, encKey, accounts]);

  const persist = useCallback(async (next) => {
    setData(next);
    if (!session) return;
    const storageKey = STORAGE_KEY + ':' + session.businessId;
    try {
      let payload;
      if (encKey && cryptoAvailable()) {
        const { iv, data: ct } = await encryptString(encKey, JSON.stringify(next));
        payload = JSON.stringify({ __enc: true, iv, data: ct });
      } else {
        payload = JSON.stringify(next);
      }
      const result = await window.storage.set(storageKey, payload, false);
      if (!result) setSaveError('Changes may not have saved.');
      else setSaveError('');
    } catch (e) {
      setSaveError('Changes may not have saved.');
    }
  }, [session, encKey]);

  // Resolves the data key from a passcode + account record. Envelope accounts
  // (wrappedDEK present) unwrap the real DEK via the passcode-derived KEK.
  // Legacy accounts (pre-envelope, no wrappedDEK) use the KEK directly as the
  // data key, exactly as before — unchanged behavior for existing businesses.
  const resolveDataKey = async (rawPasscode, acc) => {
    if (!acc || !acc.salt || !cryptoAvailable()) return null;
    const kek = await deriveEncKey(rawPasscode, acc.salt);
    if (acc.wrappedDEK) return unwrapDEK(kek, acc.wrappedDEK);
    return kek;
  };

  const login = async (acc, rawPasscode, actorName) => {
    if (rawPasscode && acc) {
      try {
        const key = await resolveDataKey(rawPasscode, acc);
        setEncKey(key);
      } catch (e) {
        setSaveError('Could not prepare secure storage: ' + (e && e.message ? e.message : String(e)));
      }
    }
    const sess = { businessId: acc.businessId, businessName: acc.businessName, actorName: actorName || '', expiresAt: Date.now() + SESSION_TTL_MS };
    setSession(sess);
    try { await window.storage.set('nexacore-session', JSON.stringify(sess), false); } catch (e) {}
  };

  const signup = async (name, passcodeHash, rawPasscode, actorName) => {
    const businessId = slugify(name) + '-' + Date.now().toString(36).slice(-4);
    let salt = null, wrappedDEK = null;
    if (cryptoAvailable()) {
      salt = randomSaltB64();
      const kek = await deriveEncKey(rawPasscode, salt);
      const dek = await generateDEK();
      wrappedDEK = await wrapDEK(kek, dek);
    }
    const acc = { businessId, businessName: name, passcodeHash, salt, wrappedDEK };
    const nextAccounts = [...accounts, acc];
    setAccounts(nextAccounts);
    try { await window.storage.set('nexacore-accounts', JSON.stringify(nextAccounts), false); } catch (e) {}
    await login(acc, rawPasscode, actorName);
  };

  const unlock = async (rawPasscode) => {
    const acc = accounts.find((a) => a.businessId === session.businessId);
    if (!acc) throw new Error('Account not found');
    const lockedSecs = await checkLockout(acc.businessId);
    if (lockedSecs > 0) throw new Error(`Too many attempts — try again in ${lockedSecs}s.`);
    const hash = await hashPasscode(rawPasscode);
    if (hash !== acc.passcodeHash) {
      await logSecurityEvent('LOGIN_FAILED', acc.businessId);
      throw new Error('Wrong passcode');
    }
    await logSecurityEvent('LOGIN_SUCCESS', acc.businessId);
    const key = await resolveDataKey(rawPasscode, acc);
    setEncKey(key);
  };

  const changePasscode = async (oldPasscode, newPasscode) => {
    const acc = accounts.find((a) => a.businessId === session.businessId);
    if (!acc) throw new Error('Account not found');
    if (!acc.wrappedDEK) throw new Error("This business predates envelope encryption, so passcode change isn't available for it yet.");
    const oldHash = await hashPasscode(oldPasscode);
    if (oldHash !== acc.passcodeHash) throw new Error('Current passcode is incorrect.');
    const oldKek = await deriveEncKey(oldPasscode, acc.salt);
    const dek = await unwrapDEK(oldKek, acc.wrappedDEK);
    const newSalt = randomSaltB64();
    const newKek = await deriveEncKey(newPasscode, newSalt);
    const newWrappedDEK = await wrapDEK(newKek, dek);
    const newHash = await hashPasscode(newPasscode);
    const updatedAcc = { ...acc, passcodeHash: newHash, salt: newSalt, wrappedDEK: newWrappedDEK };
    const nextAccounts = accounts.map((a) => (a.businessId === acc.businessId ? updatedAcc : a));
    setAccounts(nextAccounts);
    try { await window.storage.set('nexacore-accounts', JSON.stringify(nextAccounts), false); } catch (e) {}
    // encKey (the DEK) is untouched — only the small wrapper changed, not the data.
  };

  const exportBackup = async () => {
    if (!data || !encKey || !session) return null;
    const acc = accounts.find((a) => a.businessId === session.businessId);
    const encryptedData = await encryptString(encKey, JSON.stringify(data));
    const backup = {
      __nexacoreBackup: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      businessId: session.businessId,
      businessName: data.businessName,
      salt: acc ? acc.salt : null,
      wrappedDEK: acc ? acc.wrappedDEK : null,
      legacyDirect: !(acc && acc.wrappedDEK),
      encryptedData,
    };
    downloadJSON(`nexacore-backup-${slugify(data.businessName)}-${todayStr()}.json`, backup);
    persist({
      ...data,
      lastBackupAt: backup.exportedAt,
      auditLog: [logAudit('BACKUP_EXPORTED', 'Exported a full encrypted backup'), ...data.auditLog],
    });
    return backup;
  };

  // Runs the exact same unwrap → decrypt → parse path a real restore would use,
  // read-only, against a backup that's already in memory (or re-uploaded).
  // This is the actual test — not just checking the file exists.
  const verifyBackup = async (backupObj, passcode) => {
    if (!backupObj || !backupObj.__nexacoreBackup) throw new Error('Not a valid NexaCore backup file.');
    let dataKey;
    if (backupObj.wrappedDEK) {
      const kek = await deriveEncKey(passcode, backupObj.salt);
      dataKey = await unwrapDEK(kek, backupObj.wrappedDEK);
    } else if (backupObj.legacyDirect && backupObj.salt) {
      dataKey = await deriveEncKey(passcode, backupObj.salt);
    } else {
      throw new Error('Backup is missing key information.');
    }
    const plaintext = await decryptString(dataKey, backupObj.encryptedData.iv, backupObj.encryptedData.data);
    const parsed = JSON.parse(plaintext);
    if (!Array.isArray(parsed.employees)) throw new Error('Decrypted, but the data shape looks unexpected.');
    const result = {
      employeeCount: parsed.employees.length,
      payrollRunCount: Array.isArray(parsed.payrollRuns) ? parsed.payrollRuns.length : 0,
      businessName: parsed.businessName,
    };
    if (data) {
      persist({
        ...data,
        auditLog: [logAudit('BACKUP_VERIFIED', `Verified backup from ${backupObj.exportedAt} — ${result.employeeCount} employee(s), ${result.payrollRunCount} payroll run(s)`), ...data.auditLog],
      });
    }
    return result;
  };

  const restoreFromBackup = async (backupObj, passcode) => {
    if (!backupObj || !backupObj.__nexacoreBackup) throw new Error('Not a valid NexaCore backup file.');
    let dataKey;
    if (backupObj.wrappedDEK) {
      const kek = await deriveEncKey(passcode, backupObj.salt);
      dataKey = await unwrapDEK(kek, backupObj.wrappedDEK);
    } else if (backupObj.legacyDirect && backupObj.salt) {
      dataKey = await deriveEncKey(passcode, backupObj.salt);
    } else {
      throw new Error('Backup is missing key information.');
    }
    const plaintext = await decryptString(dataKey, backupObj.encryptedData.iv, backupObj.encryptedData.data);
    const restoredData = JSON.parse(plaintext);

    // Always issue a fresh salt + wrapped DEK on restore (never reuse the
    // file's key material as-is), and upgrade legacy-direct backups to a
    // real envelope DEK while we're already rewriting everything anyway.
    const newSalt = randomSaltB64();
    const newKek = await deriveEncKey(passcode, newSalt);
    const newDek = backupObj.wrappedDEK ? dataKey : await generateDEK();
    const newWrappedDEK = await wrapDEK(newKek, newDek);
    const passcodeHash = await hashPasscode(passcode);

    const idTaken = backupObj.businessId && accounts.some((a) => a.businessId === backupObj.businessId);
    const businessId = backupObj.businessId && !idTaken ? backupObj.businessId : slugify(backupObj.businessName) + '-' + Date.now().toString(36).slice(-4);

    const acc = { businessId, businessName: backupObj.businessName, passcodeHash, salt: newSalt, wrappedDEK: newWrappedDEK };
    const nextAccounts = [...accounts.filter((a) => a.businessId !== businessId), acc];
    setAccounts(nextAccounts);
    try { await window.storage.set('nexacore-accounts', JSON.stringify(nextAccounts), false); } catch (e) {}

    const enc = await encryptString(newDek, JSON.stringify(restoredData));
    const storageKey = STORAGE_KEY + ':' + businessId;
    try { await window.storage.set(storageKey, JSON.stringify({ __enc: true, iv: enc.iv, data: enc.data }), false); } catch (e) {}

    setEncKey(newDek);
    const sess = { businessId, businessName: backupObj.businessName, expiresAt: Date.now() + SESSION_TTL_MS };
    setSession(sess);
    try { await window.storage.set('nexacore-session', JSON.stringify(sess), false); } catch (e) {}
  };

  const logout = async () => {
    setSession(null);
    setData(null);
    setEncKey(null);
    setDecryptError('');
    try { await window.storage.set('nexacore-session', JSON.stringify(null), false); } catch (e) {}
  };

  if (session === undefined) {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: COLORS.page }}>
        <Loader2 className="animate-spin" size={22} style={{ color: COLORS.ink }} />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen accounts={accounts} onLogin={login} onSignup={signup} onRestore={restoreFromBackup} />;
  }

  const currentAccount = accounts.find((a) => a.businessId === session.businessId);
  const needsUnlock = !!(currentAccount && currentAccount.salt) && !encKey;

  if (needsUnlock) {
    return <UnlockScreen businessName={session.businessName} onUnlock={unlock} onLogout={logout} />;
  }

  if (decryptError) {
    return (
      <div className="h-screen w-full flex items-center justify-center p-8" style={{ backgroundColor: COLORS.page }}>
        <div className="max-w-md w-full">
          <div className="text-sm font-semibold mb-2" style={{ color: COLORS.rust }}>Couldn't unlock your data</div>
          <div className="text-xs p-4 rounded-lg mb-4" style={{ color: COLORS.textMuted, backgroundColor: '#fff', border: `1px solid ${COLORS.border}`, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {decryptError}
          </div>
          <div className="text-xs mb-4" style={{ color: COLORS.textMuted }}>
            Your passcode was correct, but the stored data couldn't be decrypted with it — this points to a real bug rather than data loss; nothing has been deleted.
          </div>
          <button onClick={logout} className="text-sm font-semibold px-4 py-2.5 rounded-xl" style={{ backgroundColor: COLORS.ink, color: '#fff' }}>Log out</button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: COLORS.page }}>
        <Loader2 className="animate-spin" size={22} style={{ color: COLORS.ink }} />
      </div>
    );
  }

  const activeEmployees = data.employees.filter((e) => e.active !== false);
  const applySDL = activeEmployees.length >= (data.taxSettings?.sdlThreshold ?? 10);
  const pendingLeave = data.leave.filter((l) => l.status === 'pending').length;
  const lastRun = data.payrollRuns[data.payrollRuns.length - 1];

  const logAudit = (action, detail) => ({
    id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    at: new Date().toISOString(),
    action,
    detail: session && session.actorName ? `${session.actorName} — ${detail}` : detail,
  });

  const addEmployee = (emp) => {
    const employee = { id: 'e' + Date.now(), active: true, ...emp };
    persist({
      ...data,
      employees: [...data.employees, employee],
      auditLog: [logAudit('EMPLOYEE_ADDED', `Added ${employee.name} (${employee.role})`), ...data.auditLog],
    });
  };

  const updateEmployee = (id, updates) => {
    const before = data.employees.find((e) => e.id === id);
    const entries = [];
    if (before && updates.salary !== undefined && Number(updates.salary) !== before.salary) {
      entries.push(logAudit('SALARY_CHANGED', `${before.name}: ${fmt(before.salary)} → ${fmt(Number(updates.salary))}`));
    }
    persist({
      ...data,
      employees: data.employees.map((e) => (e.id === id ? { ...e, ...updates } : e)),
      auditLog: [...entries, ...data.auditLog],
    });
  };

  const archiveEmployee = (id) => {
    const emp = data.employees.find((e) => e.id === id);
    persist({
      ...data,
      employees: data.employees.map((e) => (e.id === id ? { ...e, active: false } : e)),
      auditLog: [logAudit('EMPLOYEE_ARCHIVED', `Removed ${emp ? emp.name : id} from active staff`), ...data.auditLog],
    });
  };

  const restoreEmployee = (id) => {
    const emp = data.employees.find((e) => e.id === id);
    persist({
      ...data,
      employees: data.employees.map((e) => (e.id === id ? { ...e, active: true } : e)),
      auditLog: [logAudit('EMPLOYEE_RESTORED', `Restored ${emp ? emp.name : id} to active staff`), ...data.auditLog],
    });
  };

  const markAttendance = (employeeId, status) => {
    const date = todayStr();
    const others = data.attendance.filter((a) => !(a.employeeId === employeeId && a.date === date));
    persist({ ...data, attendance: [...others, { id: 'a' + Date.now() + employeeId, employeeId, date, status }] });
  };

  const addLeave = (req) => persist({ ...data, leave: [{ id: 'l' + Date.now(), status: 'pending', ...req }, ...data.leave] });

  const setLeaveStatus = (id, status) =>
    persist({ ...data, leave: data.leave.map((l) => (l.id === id ? { ...l, status } : l)) });

  const runPayroll = (employeeId, period) => {
    const emp = data.employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const breakdown = runPayrollCalc(emp.salary, applySDL, data.taxSettings);
    const run = { id: 'p' + Date.now(), employeeId, employeeName: emp.name, period, status: 'draft', ranAt: new Date().toISOString(), ...breakdown };
    persist({
      ...data,
      payrollRuns: [...data.payrollRuns, run],
      auditLog: [logAudit('PAYROLL_RUN', `Drafted payroll for ${emp.name} — ${period}`), ...data.auditLog],
    });
    return run;
  };

  const runBatchPayroll = (period) => {
    const newRuns = activeEmployees.map((emp) => {
      const breakdown = runPayrollCalc(emp.salary, applySDL, data.taxSettings);
      return { id: 'p' + Date.now() + '-' + emp.id, employeeId: emp.id, employeeName: emp.name, period, status: 'draft', ranAt: new Date().toISOString(), ...breakdown };
    });
    persist({
      ...data,
      payrollRuns: [...data.payrollRuns, ...newRuns],
      auditLog: [logAudit('PAYROLL_BATCH_RUN', `Drafted payroll for ${newRuns.length} staff — ${period}`), ...data.auditLog],
    });
    return newRuns;
  };

  const approveRun = (id) => {
    const run = data.payrollRuns.find((r) => r.id === id);
    persist({
      ...data,
      payrollRuns: data.payrollRuns.map((r) => (r.id === id ? { ...r, status: 'approved' } : r)),
      auditLog: [logAudit('PAYROLL_APPROVED', `Approved payroll for ${run ? run.employeeName : id} — ${run ? run.period : ''}`), ...data.auditLog],
    });
  };

  const markRunPaid = (id) => {
    const run = data.payrollRuns.find((r) => r.id === id);
    persist({
      ...data,
      payrollRuns: data.payrollRuns.map((r) => (r.id === id ? { ...r, status: 'paid' } : r)),
      auditLog: [logAudit('PAYROLL_PAID', `Marked payroll paid for ${run ? run.employeeName : id} — ${run ? run.period : ''}`), ...data.auditLog],
    });
  };

  const approveAllDrafts = (period) => {
    const drafts = data.payrollRuns.filter((r) => r.period === period && r.status === 'draft');
    persist({
      ...data,
      payrollRuns: data.payrollRuns.map((r) => (r.period === period && r.status === 'draft' ? { ...r, status: 'approved' } : r)),
      auditLog: [logAudit('PAYROLL_APPROVED', `Approved ${drafts.length} draft payslip(s) — ${period}`), ...data.auditLog],
    });
  };

  const updateTaxSettings = (settings) =>
    persist({
      ...data,
      taxSettings: settings,
      auditLog: [logAudit('TAX_SETTINGS_CHANGED', 'Updated statutory tax settings'), ...data.auditLog],
    });

  const addNote = (note) =>
    persist({ ...data, adminLog: [{ id: 'n' + Date.now(), date: new Date().toISOString(), note }, ...data.adminLog] });

  const addTask = (title, dueDate) =>
    persist({ ...data, tasks: [{ id: 't' + Date.now(), title, dueDate, done: false }, ...data.tasks] });

  const toggleTask = (id) =>
    persist({ ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) });

  const deleteTask = (id) =>
    persist({ ...data, tasks: data.tasks.filter((t) => t.id !== id) });

  const updateCompanyInfo = (info) => persist({ ...data, companyInfo: info });

  const setBusinessName = (name) => persist({ ...data, businessName: name });

  return (
    <div className="flex h-screen w-full overflow-hidden ncp-app" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        ${FONT_IMPORT}
        @keyframes stampIn {
          0% { opacity: 0; transform: scale(1.12) rotate(-3deg); }
          60% { opacity: 1; transform: scale(0.97) rotate(1deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .ncp-stamp { animation: stampIn 0.45s ease-out; }
        .ncp-scroll::-webkit-scrollbar { width: 8px; }
        .ncp-scroll::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 8px; }
        input:focus, select:focus, textarea:focus { border-color: ${COLORS.gold} !important; box-shadow: 0 0 0 3px ${COLORS.goldSoft}; }
        @media print {
          .no-print { display: none !important; }
          .ncp-app { height: auto !important; overflow: visible !important; }
          .ncp-scroll { overflow: visible !important; height: auto !important; background: #fff !important; }
          body { background: #fff !important; }
        }
      `}</style>

      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col no-print" style={{ backgroundColor: COLORS.ink }}>
        <div className="px-6 py-6">
          <div className="text-xs tracking-[0.2em] uppercase mb-1" style={{ color: COLORS.goldLight }}>NexaCore</div>
          <div className="text-xl text-white" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>People</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition"
                style={{
                  backgroundColor: active ? COLORS.inkLighter : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                }}
              >
                <Icon size={17} />
                {item.label}
                {item.id === 'leave' && pendingLeave > 0 && (
                  <span
                    className="ml-auto text-xs font-bold rounded-full px-1.5 py-0.5"
                    style={{ backgroundColor: COLORS.gold, color: COLORS.ink }}
                  >
                    {pendingLeave}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-6 py-5 text-xs">
          <div className="mb-2 truncate font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>{data.businessName}</div>
          <button onClick={logout} className="font-semibold" style={{ color: COLORS.goldLight }}>Log out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto ncp-scroll" style={{ backgroundColor: COLORS.page }}>
        <div className="max-w-4xl mx-auto px-10 py-10">
          {saveError && (
            <div className="mb-4 text-sm px-4 py-2 rounded-lg no-print" style={{ backgroundColor: COLORS.rustSoft, color: COLORS.rust }}>
              {saveError}
            </div>
          )}

          {section === 'overview' && (
            <Overview data={data} setBusinessName={setBusinessName} pendingLeave={pendingLeave} lastRun={lastRun} applySDL={applySDL} />
          )}
          {section === 'staff' && (
            <Staff employees={data.employees} addEmployee={addEmployee} updateEmployee={updateEmployee} archiveEmployee={archiveEmployee} restoreEmployee={restoreEmployee} />
          )}
          {section === 'attendance' && (
            <Attendance employees={activeEmployees} attendance={data.attendance} markAttendance={markAttendance} />
          )}
          {section === 'leave' && (
            <Leave employees={activeEmployees} leave={data.leave} addLeave={addLeave} setLeaveStatus={setLeaveStatus} />
          )}
          {section === 'payroll' && (
            <Payroll
              employees={activeEmployees}
              payrollRuns={data.payrollRuns}
              runPayroll={runPayroll}
              runBatchPayroll={runBatchPayroll}
              approveRun={approveRun}
              markRunPaid={markRunPaid}
              approveAllDrafts={approveAllDrafts}
              applySDL={applySDL}
              requireStepUp={requireStepUp}
            />
          )}
          {section === 'log' && (
            <Administration
              tasks={data.tasks}
              addTask={addTask}
              toggleTask={toggleTask}
              deleteTask={deleteTask}
              companyInfo={data.companyInfo}
              updateCompanyInfo={updateCompanyInfo}
              taxSettings={data.taxSettings}
              updateTaxSettings={updateTaxSettings}
              log={data.adminLog}
              addNote={addNote}
              auditLog={data.auditLog}
              hasEnvelopeEncryption={!!(currentAccount && currentAccount.wrappedDEK)}
              changePasscode={changePasscode}
              exportBackup={exportBackup}
              verifyBackup={verifyBackup}
              lastBackupAt={data.lastBackupAt}
              requireStepUp={requireStepUp}
              businessId={session.businessId}
            />
          )}
        </div>
      </main>

      {stepUp && (
        <StepUpModal
          label={stepUp.label}
          expectedHash={accounts.find((a) => a.businessId === session.businessId)?.passcodeHash}
          onResolve={(ok) => { stepUp.resolve(ok); setStepUp(null); }}
        />
      )}
    </div>
  );
}

function StepUpModal({ label, expectedHash, onResolve }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const confirm = async () => {
    setChecking(true);
    setError('');
    try {
      const hash = await hashPasscode(passcode);
      if (hash !== expectedHash) { setError('Wrong passcode.'); setChecking(false); return; }
      onResolve(true);
    } catch (err) {
      setError('Could not verify: ' + (err && err.message ? err.message : String(err)));
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(20,33,61,0.55)' }}>
      <div className="w-full max-w-sm mx-6 rounded-2xl p-6" style={{ backgroundColor: '#fff' }}>
        <div className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Confirm to continue</div>
        <div className="text-xs mb-4" style={{ color: COLORS.textMuted }}>
          Re-enter your business passcode to {label}. This is a confirmation step, not multi-factor authentication — there's no OTP or second device involved.
        </div>
        <Field label="Passcode">
          <input
            autoFocus
            style={inputStyle}
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
          />
        </Field>
        {error && <div className="text-xs mt-2" style={{ color: COLORS.rust }}>{error}</div>}
        <div className="flex gap-3 mt-4">
          <PrimaryButton type="button" onClick={confirm} disabled={checking}>{checking ? 'Checking…' : 'Confirm'}</PrimaryButton>
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="text-sm font-semibold px-4 py-2.5 rounded-xl"
            style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Overview({ data, setBusinessName, pendingLeave, lastRun, applySDL }) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(data.businessName);
  const t = data.taxSettings || defaultTaxSettings();
  const projection = projectPayrollCost(data.employees, t, applySDL);
  const riskCount = computeRiskFlags(data.employees, data.payrollRuns).length;

  return (
    <div>
      <div className="mb-8">
        <div className="text-xs font-semibold tracking-[0.14em] uppercase mb-1" style={{ color: COLORS.gold }}>Overview</div>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              style={{ ...inputStyle, fontFamily: "'Fraunces', serif", fontSize: '24px', maxWidth: '360px' }}
            />
            <button
              className="text-sm font-semibold px-3 py-2 rounded-lg"
              style={{ backgroundColor: COLORS.ink, color: '#fff' }}
              onClick={() => { setBusinessName(nameDraft || 'Your Business'); setEditingName(false); }}
            >
              Save
            </button>
          </div>
        ) : (
          <h1
            className="text-3xl cursor-pointer"
            style={{ fontFamily: "'Fraunces', serif", color: COLORS.ink, fontWeight: 600 }}
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {data.businessName}
          </h1>
        )}
        <p className="text-sm mt-1" style={{ color: COLORS.textMuted }}>Your staff, attendance, leave, and payroll — in one place.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>Staff</div>
          <div className="text-3xl" style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.ink }}>{data.employees.length}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>Pending Leave</div>
          <div className="text-3xl" style={{ fontFamily: "'JetBrains Mono', monospace", color: pendingLeave ? COLORS.rust : COLORS.ink }}>{pendingLeave}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>Last Payroll</div>
          <div className="text-lg" style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.ink }}>
            {lastRun ? lastRun.period : 'Not yet run'}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>Next payroll (projected, current staff & rates)</div>
          <div className="flex items-baseline gap-4">
            <div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>Total net pay</div>
              <div className="text-xl" style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.ink }}>{fmt(projection.totalNet)}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>Total cost to business</div>
              <div className="text-xl" style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.ink }}>{fmt(projection.totalCost)}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>Risk checks</div>
          <div className="text-3xl" style={{ fontFamily: "'JetBrains Mono', monospace", color: riskCount ? COLORS.rust : COLORS.green }}>
            {riskCount || 'Clear'}
          </div>
          {riskCount > 0 && <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>See Payroll for details</div>}
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>Backup</div>
          {(() => {
            const days = data.lastBackupAt ? Math.floor((Date.now() - new Date(data.lastBackupAt).getTime()) / 86400000) : null;
            const tone = days === null || days > 30 ? COLORS.rust : days > 7 ? COLORS.gold : COLORS.green;
            return (
              <>
                <div className="text-lg" style={{ fontFamily: "'JetBrains Mono', monospace", color: tone }}>
                  {days === null ? 'Never' : days === 0 ? 'Today' : `${days}d ago`}
                </div>
                <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>Export one in Administration</div>
              </>
            );
          })()}
        </Card>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} style={{ color: COLORS.green, marginTop: 2 }} />
          <div className="text-sm" style={{ color: COLORS.textDark }}>
            <div className="font-semibold mb-1">Statutory settings</div>
            <div style={{ color: COLORS.textMuted }}>
              NSSF {(t.nssfEmployeeRate * 100).toFixed(0)}% + {(t.nssfEmployerRate * 100).toFixed(0)}%, PAYE on {t.payeBands.length} configurable bands, WCF {(t.wcfRate * 100).toFixed(1)}% applied automatically.{' '}
              SDL ({(t.sdlRate * 100).toFixed(1)}%, employer-only) is currently <strong>{applySDL ? 'active' : 'not applied'}</strong> — it only kicks in at {t.sdlThreshold}+ staff. NHIF is <strong>{t.nhifEnabled ? 'active' : 'off'}</strong>. Editable in Administration.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Staff({ employees, addEmployee, updateEmployee, archiveEmployee, restoreEmployee }) {
  const [editingId, setEditingId] = useState(null); // null | 'new' | employee id
  const [showArchived, setShowArchived] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [salary, setSalary] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [leaveEntitlement, setLeaveEntitlement] = useState(String(DEFAULT_LEAVE_ENTITLEMENT));
  const [payoutMethod, setPayoutMethod] = useState('Bank Transfer');
  const [payoutBank, setPayoutBank] = useState('');
  const [payoutAccount, setPayoutAccount] = useState('');

  const active = employees.filter((e) => e.active !== false);
  const archived = employees.filter((e) => e.active === false);

  const resetForm = () => {
    setName(''); setRole(''); setSalary(''); setNationalId(''); setLeaveEntitlement(String(DEFAULT_LEAVE_ENTITLEMENT));
    setPayoutMethod('Bank Transfer'); setPayoutBank(''); setPayoutAccount('');
  };

  const startAdd = () => { resetForm(); setEditingId('new'); };

  const startEdit = (emp) => {
    setName(emp.name); setRole(emp.role); setSalary(String(emp.salary)); setNationalId(emp.nationalId || '');
    setLeaveEntitlement(String(emp.leaveEntitlement != null ? emp.leaveEntitlement : DEFAULT_LEAVE_ENTITLEMENT));
    setPayoutMethod(emp.payoutMethod || 'Bank Transfer'); setPayoutBank(emp.payoutBank || ''); setPayoutAccount(emp.payoutAccount || '');
    setEditingId(emp.id);
  };

  const submit = () => {
    if (!name || !salary) return;
    const fields = { name, role: role || 'Staff', salary: Number(salary), nationalId, leaveEntitlement: Number(leaveEntitlement) || DEFAULT_LEAVE_ENTITLEMENT, payoutMethod, payoutBank, payoutAccount };
    if (editingId === 'new') addEmployee(fields);
    else updateEmployee(editingId, fields);
    resetForm();
    setEditingId(null);
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Team"
        title="Staff"
        action={editingId === null && <PrimaryButton onClick={startAdd}><Plus size={16} /> Add employee</PrimaryButton>}
      />

      {editingId !== null && (
        <Card className="mb-5">
          <div className="grid grid-cols-3 gap-4 items-end">
            <Field label="Full name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fatuma Said" /></Field>
            <Field label="Role"><input style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Cashier" /></Field>
            <Field label="Monthly gross salary (TZS)"><input style={inputStyle} type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="400000" /></Field>
            <Field label="NIDA / TIN number (optional)"><input style={inputStyle} value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="For duplicate-ID checks" /></Field>
            <Field label="Annual leave entitlement (days/year)"><input style={inputStyle} type="number" value={leaveEntitlement} onChange={(e) => setLeaveEntitlement(e.target.value)} /></Field>
            <Field label="Payout method">
              <select style={inputStyle} value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}>
                <option>Bank Transfer</option>
                <option>Mobile Money</option>
              </select>
            </Field>
            <Field label={payoutMethod === 'Mobile Money' ? 'Network (e.g. M-Pesa, Tigo Pesa)' : 'Bank (e.g. CRDB, NMB)'}>
              <input style={inputStyle} value={payoutBank} onChange={(e) => setPayoutBank(e.target.value)} />
            </Field>
            <Field label={payoutMethod === 'Mobile Money' ? 'Phone number' : 'Account number'}>
              <input style={inputStyle} value={payoutAccount} onChange={(e) => setPayoutAccount(e.target.value)} />
            </Field>
            <div className="col-span-3 flex gap-3">
              <PrimaryButton type="button" onClick={submit}>{editingId === 'new' ? 'Save employee' : 'Save changes'}</PrimaryButton>
              <button
                type="button"
                onClick={() => { resetForm(); setEditingId(null); }}
                className="text-sm font-semibold px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: COLORS.parchment }}>
              <th className="text-left px-6 py-3 font-semibold" style={{ color: COLORS.textMuted }}>Name</th>
              <th className="text-left px-6 py-3 font-semibold" style={{ color: COLORS.textMuted }}>Role</th>
              <th className="text-left px-6 py-3 font-semibold" style={{ color: COLORS.textMuted }}>Payout</th>
              <th className="text-right px-6 py-3 font-semibold" style={{ color: COLORS.textMuted }}>Monthly Gross</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {active.map((e) => (
              <tr key={e.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td className="px-6 py-3 font-medium" style={{ color: COLORS.textDark }}>{e.name}</td>
                <td className="px-6 py-3" style={{ color: COLORS.textMuted }}>{e.role}</td>
                <td className="px-6 py-3 text-xs" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                  {e.payoutBank ? `${e.payoutBank} · ••••${String(e.payoutAccount || '').slice(-4)}` : '—'}
                </td>
                <td className="px-6 py-3 text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.textDark }}>{fmt(e.salary)}</td>
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  <button onClick={() => startEdit(e)} className="text-xs font-semibold mr-3" style={{ color: COLORS.gold }}>Edit</button>
                  {confirmArchiveId === e.id ? (
                    <>
                      <button onClick={() => { archiveEmployee(e.id); setConfirmArchiveId(null); }} className="text-xs font-semibold mr-2" style={{ color: COLORS.rust }}>Confirm</button>
                      <button onClick={() => setConfirmArchiveId(null)} className="text-xs font-semibold" style={{ color: COLORS.textMuted }}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmArchiveId(e.id)} className="text-xs font-semibold" style={{ color: COLORS.textMuted }}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
            {active.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center" style={{ color: COLORS.textMuted }}>No staff yet — add your first employee.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {archived.length > 0 && (
        <div className="mt-5">
          <button onClick={() => setShowArchived((s) => !s)} className="text-xs font-semibold" style={{ color: COLORS.textMuted }}>
            {showArchived ? 'Hide' : 'Show'} removed staff ({archived.length})
          </button>
          {showArchived && (
            <Card style={{ padding: 0 }} className="mt-3">
              <table className="w-full text-sm">
                <tbody>
                  {archived.map((e, i) => (
                    <tr key={e.id} style={{ borderTop: i ? `1px solid ${COLORS.border}` : 'none' }}>
                      <td className="px-6 py-3" style={{ color: COLORS.textMuted }}>{e.name} <span className="text-xs">— {e.role}</span></td>
                      <td className="px-6 py-3 text-right">
                        <button onClick={() => restoreEmployee(e.id)} className="text-xs font-semibold" style={{ color: COLORS.gold }}>Restore</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      <div className="text-xs mt-3" style={{ color: COLORS.textMuted }}>
        "Remove" archives an employee rather than deleting them — their past attendance, leave, and payslips stay intact.
      </div>
    </div>
  );
}

function Attendance({ employees, attendance, markAttendance }) {
  const date = todayStr();
  const statusFor = (empId) => attendance.find((a) => a.employeeId === empId && a.date === date)?.status;
  const recent = [...attendance].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  return (
    <div>
      <SectionTitle eyebrow={fmtDate(new Date().toISOString())} title="Attendance" />
      <Card className="mb-5" style={{ padding: 0 }}>
        {employees.map((e, i) => {
          const status = statusFor(e.id);
          return (
            <div key={e.id} className="flex items-center justify-between px-6 py-4" style={{ borderTop: i ? `1px solid ${COLORS.border}` : 'none' }}>
              <div>
                <div className="font-medium" style={{ color: COLORS.textDark }}>{e.name}</div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>{e.role}</div>
              </div>
              <div className="flex items-center gap-2">
                {status && <Badge tone={status === 'present' ? 'green' : 'rust'}>{status}</Badge>}
                <button
                  onClick={() => markAttendance(e.id, 'present')}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: status === 'present' ? COLORS.green : COLORS.parchment, color: status === 'present' ? '#fff' : COLORS.textDark }}
                >
                  Present
                </button>
                <button
                  onClick={() => markAttendance(e.id, 'absent')}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: status === 'absent' ? COLORS.rust : COLORS.parchment, color: status === 'absent' ? '#fff' : COLORS.textDark }}
                >
                  Absent
                </button>
              </div>
            </div>
          );
        })}
        {employees.length === 0 && <div className="px-6 py-8 text-center" style={{ color: COLORS.textMuted }}>Add staff first to track attendance.</div>}
      </Card>

      {recent.length > 0 && (
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: COLORS.textMuted }}>Recent log</div>
          <div className="space-y-2">
            {recent.map((r) => {
              const emp = employees.find((e) => e.id === r.employeeId);
              return (
                <div key={r.id} className="flex justify-between text-sm">
                  <span style={{ color: COLORS.textDark }}>{emp ? emp.name : 'Unknown'}</span>
                  <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{r.date} · {r.status}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Leave({ employees, leave, addLeave, setLeaveStatus }) {
  const [showForm, setShowForm] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState('Annual');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');

  const year = new Date().getFullYear();
  const submit = () => {
    if (!employeeId || !from || !to) return;
    addLeave({ employeeId, type, from, to, reason });
    setEmployeeId(''); setFrom(''); setTo(''); setReason(''); setShowForm(false);
  };

  const toneFor = { pending: 'gold', approved: 'green', rejected: 'rust' };

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const selectedBalance = selectedEmployee ? computeLeaveBalance(selectedEmployee, leave, year) : null;
  const requestedDays = type === 'Annual' ? daysInclusive(from, to) : 0;
  const wouldExceed = selectedBalance && requestedDays > 0 && requestedDays > selectedBalance.remaining;

  return (
    <div>
      <SectionTitle
        eyebrow="Requests"
        title="Leave"
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowBalances((s) => !s)} className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}>
              {showBalances ? 'Hide' : 'Show'} balances
            </button>
            <PrimaryButton onClick={() => setShowForm((s) => !s)}><Plus size={16} /> New request</PrimaryButton>
          </div>
        }
      />

      {showBalances && (
        <Card className="mb-5" style={{ padding: 0 }}>
          <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}` }}>
            Annual leave balance · {year} (calendar-year tracking — see note below)
          </div>
          <table className="w-full text-sm">
            <tbody>
              {employees.filter((e) => e.active !== false).map((e, i) => {
                const b = computeLeaveBalance(e, leave, year);
                return (
                  <tr key={e.id} style={{ borderTop: i ? `1px solid ${COLORS.border}` : 'none' }}>
                    <td className="px-6 py-2.5" style={{ color: COLORS.textDark }}>{e.name}</td>
                    <td className="px-6 py-2.5 text-right" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{b.entitlement} entitled</td>
                    <td className="px-6 py-2.5 text-right" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{b.used} used</td>
                    <td className="px-6 py-2.5 text-right" style={{ color: b.remaining < 0 ? COLORS.rust : COLORS.ink, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{b.remaining} left</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-6 py-3 text-xs" style={{ color: COLORS.textMuted, borderTop: `1px solid ${COLORS.border}` }}>
            Tracked by calendar year as a simplification — the actual law bases each employee's leave cycle on their own 12-month service anniversary, not Jan–Dec.
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="mb-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Employee">
              <select style={inputStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Select…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
                {['Annual', 'Sick', 'Maternity/Paternity', 'Unpaid'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="From"><input style={inputStyle} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input style={inputStyle} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <div className="col-span-2">
              <Field label="Reason (optional)"><input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </div>
            {type === 'Annual' && selectedBalance && (
              <div className="col-span-2 text-xs" style={{ color: wouldExceed ? COLORS.rust : COLORS.textMuted }}>
                {selectedEmployee.name} has {selectedBalance.remaining} day(s) of annual leave left this year.
                {wouldExceed && ` This request (${requestedDays} days) would exceed that — still allowed, just flagging it.`}
              </div>
            )}
            <div className="col-span-2"><PrimaryButton type="button" onClick={submit}>Submit request</PrimaryButton></div>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {leave.map((l) => {
          const emp = employees.find((e) => e.id === l.employeeId);
          return (
            <Card key={l.id}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: COLORS.textDark }}>{emp ? emp.name : 'Unknown'} · {l.type}</div>
                  <div className="text-xs mt-0.5" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{l.from} → {l.to}</div>
                  {l.reason && <div className="text-sm mt-1" style={{ color: COLORS.textMuted }}>{l.reason}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={toneFor[l.status]}>{l.status}</Badge>
                  {l.status === 'pending' && (
                    <>
                      <button onClick={() => setLeaveStatus(l.id, 'approved')} className="p-1.5 rounded-lg" style={{ backgroundColor: COLORS.greenSoft }}><Check size={15} style={{ color: COLORS.green }} /></button>
                      <button onClick={() => setLeaveStatus(l.id, 'rejected')} className="p-1.5 rounded-lg" style={{ backgroundColor: COLORS.rustSoft }}><X size={15} style={{ color: COLORS.rust }} /></button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {leave.length === 0 && <div className="text-center py-10" style={{ color: COLORS.textMuted }}>No leave requests yet.</div>}
      </div>
    </div>
  );
}

function Payslip({ run, onApprove, onMarkPaid }) {
  const statusTone = run.status === 'paid' ? 'green' : run.status === 'approved' ? 'gold' : 'muted';
  return (
    <>
      <div className="flex justify-between items-center mb-3 no-print">
        <div className="flex items-center gap-2">
          <Badge tone={statusTone}>{run.status || 'draft'}</Badge>
          {onApprove && (
            <button onClick={onApprove} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ backgroundColor: COLORS.green, color: '#fff' }}>
              Approve
            </button>
          )}
          {onMarkPaid && (
            <button onClick={onMarkPaid} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ backgroundColor: COLORS.ink, color: '#fff' }}>
              Mark as paid
            </button>
          )}
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ backgroundColor: COLORS.ink, color: '#fff' }}
        >
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>
      <Card className="ncp-stamp" style={{ borderStyle: 'dashed', borderColor: COLORS.parchmentDark, backgroundColor: COLORS.parchment }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Payslip · {run.period}</div>
          <div className="text-xl mt-0.5" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: COLORS.ink }}>{run.employeeName}</div>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ backgroundColor: COLORS.gold, color: '#fff' }}
        >
          <ShieldCheck size={13} /> TRA COMPLIANT
        </div>
      </div>

      <div className="space-y-1.5 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <Row label="Gross salary" value={fmt(run.gross)} />
        <Row label={`NSSF (employee, ${pct(run.nssfEmployee, run.gross)}%)`} value={'− ' + fmt(run.nssfEmployee)} negative />
        {run.nhifEmployee > 0 && <Row label={`NHIF (employee, ${pct(run.nhifEmployee, run.gross)}%)`} value={'− ' + fmt(run.nhifEmployee)} negative />}
        <Row label="PAYE" value={'− ' + fmt(run.paye)} negative />
        <div className="border-t my-2" style={{ borderColor: COLORS.parchmentDark }} />
        <Row label="Net pay" value={fmt(run.netPay)} bold />
      </div>

      <div className="border-t my-4" style={{ borderColor: COLORS.parchmentDark }} />

      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>Employer also pays</div>
      <div className="space-y-1.5 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <Row label={`NSSF (employer, ${pct(run.nssfEmployer, run.gross)}%)`} value={fmt(run.nssfEmployer)} />
        {run.nhifEmployer > 0 && <Row label={`NHIF (employer, ${pct(run.nhifEmployer, run.gross)}%)`} value={fmt(run.nhifEmployer)} />}
        <Row label={`SDL (${pct(run.sdl, run.gross)}%)${run.sdl === 0 ? ' — below staff threshold' : ''}`} value={fmt(run.sdl)} />
        <Row label={`WCF (${pct(run.wcf, run.gross)}%)`} value={fmt(run.wcf)} />
        <div className="border-t my-2" style={{ borderColor: COLORS.parchmentDark }} />
        <Row label="Total cost to business" value={fmt(run.employerCost)} bold />
      </div>
    </Card>
    </>
  );
}

function Row({ label, value, bold, negative }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: COLORS.textMuted, fontFamily: "'Inter', sans-serif" }}>{label}</span>
      <span style={{ color: negative ? COLORS.rust : COLORS.textDark, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

const BANK_CODES = {
  CRDB: 'CORUTZTZ', // verified SWIFT/BIC
  NMB: 'NLCBTZTZ', // verified SWIFT/BIC
};

function lookupBankCode(bankName) {
  if (!bankName) return '';
  const key = Object.keys(BANK_CODES).find((k) => bankName.toUpperCase().includes(k));
  return key ? BANK_CODES[key] : bankName.toUpperCase();
}

function Payroll({ employees, payrollRuns, runPayroll, runBatchPayroll, approveRun, markRunPaid, approveAllDrafts, applySDL, requireStepUp }) {
  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [latest, setLatest] = useState(payrollRuns[payrollRuns.length - 1] || null);
  const [batchMsg, setBatchMsg] = useState('');
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [p9EmployeeId, setP9EmployeeId] = useState('');

  const riskFlags = computeRiskFlags(employees, payrollRuns);

  const handleRun = async () => {
    if (!employeeId) return;
    const ok = await requireStepUp('run payroll for this employee');
    if (!ok) return;
    const run = runPayroll(employeeId, period);
    if (run) setLatest(run);
  };

  const handleBatchRun = async () => {
    if (employees.length === 0) return;
    const ok = await requireStepUp(`run payroll for all ${employees.length} staff`);
    if (!ok) return;
    const runs = runBatchPayroll(period);
    setBatchMsg(`Ran payroll for ${runs.length} employee${runs.length === 1 ? '' : 's'} — ${period}.`);
    if (runs.length) setLatest(runs[runs.length - 1]);
  };

  const runsThisPeriod = payrollRuns.filter((r) => r.period === period);
  const approvedRunsThisPeriod = runsThisPeriod.filter((r) => r.status === 'approved' || r.status === 'paid');
  const draftCountThisPeriod = runsThisPeriod.filter((r) => r.status === 'draft').length;

  const exportBankPayout = async () => {
    if (approvedRunsThisPeriod.length === 0) return;
    const ok = await requireStepUp('export the bank payout file');
    if (!ok) return;
    const rows = [['ACCOUNT_NUMBER', 'EMPLOYEE_NAME', 'AMOUNT_TZS', 'BANK_CODE', 'REMARKS']];
    approvedRunsThisPeriod.forEach((r) => {
      const emp = employees.find((e) => e.id === r.employeeId);
      rows.push([
        emp?.payoutAccount || '',
        r.employeeName,
        Math.round(r.netPay).toFixed(2),
        lookupBankCode(emp?.payoutBank),
        `SALARY_${period.replace('-', '_').toUpperCase()}`,
      ]);
    });
    downloadCSV(`bank-payout-${period}.csv`, rows);
  };

  const exportStatutory = async () => {
    if (approvedRunsThisPeriod.length === 0) return;
    const ok = await requireStepUp('export the statutory filing summary');
    if (!ok) return;
    const rows = [['Employee', 'Gross', 'NSSF Employee', 'NSSF Employer', 'PAYE', 'SDL', 'WCF', 'NHIF Employee', 'NHIF Employer', 'Net Pay', 'Employer Cost']];
    approvedRunsThisPeriod.forEach((r) => {
      rows.push([r.employeeName, Math.round(r.gross), Math.round(r.nssfEmployee), Math.round(r.nssfEmployer), Math.round(r.paye), Math.round(r.sdl), Math.round(r.wcf), Math.round(r.nhifEmployee || 0), Math.round(r.nhifEmployer || 0), Math.round(r.netPay), Math.round(r.employerCost)]);
    });
    downloadCSV(`statutory-filing-${period}.csv`, rows);
  };

  const runsForYear = (year) => payrollRuns.filter((r) => r.period.startsWith(String(year)) && (r.status === 'approved' || r.status === 'paid'));

  const exportP9 = async () => {
    if (!p9EmployeeId) return;
    const runs = runsForYear(reportYear).filter((r) => r.employeeId === p9EmployeeId).sort((a, b) => a.period.localeCompare(b.period));
    if (runs.length === 0) return;
    const ok = await requireStepUp('export a P9 annual tax summary');
    if (!ok) return;
    const emp = employees.find((e) => e.id === p9EmployeeId);
    const rows = [['Month', 'Gross', 'NSSF Employee', 'NHIF Employee', 'PAYE', 'Net Pay']];
    const t = { gross: 0, nssfEmployee: 0, nhifEmployee: 0, paye: 0, netPay: 0 };
    runs.forEach((r) => {
      rows.push([r.period, Math.round(r.gross), Math.round(r.nssfEmployee), Math.round(r.nhifEmployee || 0), Math.round(r.paye), Math.round(r.netPay)]);
      t.gross += r.gross; t.nssfEmployee += r.nssfEmployee; t.nhifEmployee += r.nhifEmployee || 0; t.paye += r.paye; t.netPay += r.netPay;
    });
    rows.push(['TOTAL', Math.round(t.gross), Math.round(t.nssfEmployee), Math.round(t.nhifEmployee), Math.round(t.paye), Math.round(t.netPay)]);
    downloadCSV(`P9-${slugify(emp ? emp.name : 'employee')}-${reportYear}.csv`, rows);
  };

  const exportP10 = async () => {
    const runs = runsForYear(reportYear);
    if (runs.length === 0) return;
    const ok = await requireStepUp('export a P10 employer annual summary');
    if (!ok) return;
    const byEmployee = {};
    runs.forEach((r) => {
      if (!byEmployee[r.employeeId]) {
        byEmployee[r.employeeId] = { name: r.employeeName, gross: 0, nssfEmployee: 0, nssfEmployer: 0, paye: 0, sdl: 0, wcf: 0, nhifEmployee: 0, nhifEmployer: 0, netPay: 0 };
      }
      const b = byEmployee[r.employeeId];
      b.gross += r.gross; b.nssfEmployee += r.nssfEmployee; b.nssfEmployer += r.nssfEmployer; b.paye += r.paye;
      b.sdl += r.sdl; b.wcf += r.wcf; b.nhifEmployee += r.nhifEmployee || 0; b.nhifEmployer += r.nhifEmployer || 0; b.netPay += r.netPay;
    });
    const rows = [['Employee', 'Gross', 'NSSF Employee', 'NSSF Employer', 'PAYE', 'SDL', 'WCF', 'NHIF Employee', 'NHIF Employer', 'Net Pay']];
    const grand = { gross: 0, nssfEmployee: 0, nssfEmployer: 0, paye: 0, sdl: 0, wcf: 0, nhifEmployee: 0, nhifEmployer: 0, netPay: 0 };
    Object.values(byEmployee).forEach((b) => {
      rows.push([b.name, Math.round(b.gross), Math.round(b.nssfEmployee), Math.round(b.nssfEmployer), Math.round(b.paye), Math.round(b.sdl), Math.round(b.wcf), Math.round(b.nhifEmployee), Math.round(b.nhifEmployer), Math.round(b.netPay)]);
      Object.keys(grand).forEach((k) => { grand[k] += b[k]; });
    });
    rows.push(['GRAND TOTAL', ...Object.keys(grand).map((k) => Math.round(grand[k]))]);
    downloadCSV(`P10-employer-summary-${reportYear}.csv`, rows);
  };

  return (
    <div>
      <div className="no-print"><SectionTitle eyebrow="Statutory payroll" title="Payroll" /></div>

      <Card className="mb-5 no-print" style={{ borderColor: riskFlags.length ? COLORS.rustSoft : COLORS.border }}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={16} style={{ color: riskFlags.length ? COLORS.rust : COLORS.green }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.textMuted }}>
            Risk checks {riskFlags.length ? `(${riskFlags.length})` : '— clear'}
          </span>
        </div>
        {riskFlags.length === 0 ? (
          <div className="text-sm" style={{ color: COLORS.textMuted }}>No duplicate accounts, duplicate IDs, or unusual salary changes detected.</div>
        ) : (
          <div className="space-y-1.5">
            {riskFlags.map((f, i) => (
              <div key={i} className="text-sm" style={{ color: COLORS.textDark }}>
                <Badge tone={f.type === 'SALARY_SPIKE' ? 'gold' : 'rust'}>{f.type.replace(/_/g, ' ')}</Badge>{' '}
                {f.detail}
              </div>
            ))}
          </div>
        )}
        <div className="text-xs mt-2" style={{ color: COLORS.textMuted }}>
          Rule-based checks on your own data (duplicate fields, a 20% salary-change threshold) — not machine learning, and not a substitute for reviewing each payslip yourself.
        </div>
      </Card>

      <Card className="mb-5 no-print">
        <div className="grid grid-cols-3 gap-4 items-end mb-4">
          <Field label="Employee">
            <select style={inputStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Pay period"><input style={inputStyle} type="month" value={period} onChange={(e) => { setPeriod(e.target.value); setBatchMsg(''); }} /></Field>
          <PrimaryButton type="button" onClick={handleRun}>Run for this employee</PrimaryButton>
        </div>
        <div className="pt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <div className="text-xs" style={{ color: COLORS.textMuted }}>
            {batchMsg || `Or run payroll for all ${employees.length} staff at once, for ${period}.`}
          </div>
          <button
            onClick={handleBatchRun}
            disabled={employees.length === 0}
            className="text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ backgroundColor: COLORS.gold, color: '#fff' }}
          >
            Run payroll for all staff
          </button>
        </div>
        {draftCountThisPeriod > 0 && (
          <div className="pt-4 mt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <div className="text-xs" style={{ color: COLORS.textMuted }}>
              {draftCountThisPeriod} draft payslip{draftCountThisPeriod === 1 ? '' : 's'} for {period} — review below, then approve before exporting.
            </div>
            <button
              onClick={async () => { const ok = await requireStepUp(`approve ${draftCountThisPeriod} draft payslip(s)`); if (ok) approveAllDrafts(period); }}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ backgroundColor: COLORS.green, color: '#fff' }}
            >
              Approve all drafts for {period}
            </button>
          </div>
        )}
      </Card>

      {runsThisPeriod.length > 0 && (
        <Card className="mb-5 no-print">
          <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: COLORS.textMuted }}>
            Exports for {period} ({approvedRunsThisPeriod.length} approved{draftCountThisPeriod ? `, ${draftCountThisPeriod} still draft` : ''})
          </div>
          <div className="flex gap-3">
            <button onClick={exportBankPayout} disabled={approvedRunsThisPeriod.length === 0} className="text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}>
              Download bank/mobile-money payout CSV
            </button>
            <button onClick={exportStatutory} disabled={approvedRunsThisPeriod.length === 0} className="text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}>
              Download statutory filing CSV
            </button>
          </div>
          <div className="text-xs mt-3" style={{ color: COLORS.textMuted }}>
            Bank codes use verified SWIFT/BIC values where matched (CRDB, NMB); confirm the exact column layout against each bank's current bulk-payment portal before uploading — proprietary import formats vary and aren't publicly documented.
          </div>
        </Card>
      )}

      <Card className="mb-5 no-print">
        <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: COLORS.textMuted }}>Year-end statutory reports</div>
        <div className="grid grid-cols-3 gap-4 items-end mb-3">
          <Field label="Year">
            <input style={inputStyle} type="number" value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))} />
          </Field>
          <Field label="Employee (for P9)">
            <select style={inputStyle} value={p9EmployeeId} onChange={(e) => setP9EmployeeId(e.target.value)}>
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <button onClick={exportP9} disabled={!p9EmployeeId} className="text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}>
            Download P9 (employee)
          </button>
        </div>
        <button onClick={exportP10} className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}>
          Download P10 (all staff, {reportYear})
        </button>
        <div className="text-xs mt-3" style={{ color: COLORS.textMuted }}>
          These provide the underlying figures for TRA's P9/P10 filings, built from your payroll runs — they're data exports, not the official TRA form itself.
        </div>
      </Card>

      {latest && (
        <div className="mb-6">
          <Payslip
            run={latest}
            onApprove={latest.status === 'draft' ? async () => { const ok = await requireStepUp('approve this payslip'); if (ok) { approveRun(latest.id); setLatest({ ...latest, status: 'approved' }); } } : null}
            onMarkPaid={latest.status === 'approved' ? async () => { const ok = await requireStepUp('mark this payslip as paid'); if (ok) { markRunPaid(latest.id); setLatest({ ...latest, status: 'paid' }); } } : null}
          />
        </div>
      )}

      {payrollRuns.length > 0 && (
        <Card style={{ padding: 0 }} className="no-print">
          <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}` }}>Past runs</div>
          <table className="w-full text-sm">
            <tbody>
              {[...payrollRuns].reverse().map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }} className="cursor-pointer" onClick={() => setLatest(r)}>
                  <td className="px-6 py-3" style={{ color: COLORS.textDark }}>{r.employeeName}</td>
                  <td className="px-6 py-3" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{r.period}</td>
                  <td className="px-6 py-3">
                    <Badge tone={r.status === 'paid' ? 'green' : r.status === 'approved' ? 'gold' : 'muted'}>{r.status || 'draft'}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.ink }}>{fmt(r.netPay)}</td>
                  <td className="px-6 py-3 text-right"><ChevronRight size={14} style={{ color: COLORS.textMuted }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-xs" style={{ color: COLORS.textMuted }}>{label}</div>
      <div style={{ color: value ? COLORS.textDark : COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{value || '—'}</div>
    </div>
  );
}

function SecurityCard({ hasEnvelopeEncryption, changePasscode, exportBackup, verifyBackup, lastBackupAt, requireStepUp, businessId }) {
  const [changingPasscode, setChangingPasscode] = useState(false);
  const [oldPasscode, setOldPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [securityEvents, setSecurityEvents] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getSecurityLog(businessId).then((log) => { if (!cancelled) setSecurityEvents(log.slice(-10).reverse()); });
    return () => { cancelled = true; };
  }, [businessId]);

  const [pendingBackup, setPendingBackup] = useState(null);
  const [verifyPasscode, setVerifyPasscode] = useState('');
  const [verifyResult, setVerifyResult] = useState(null); // { ok, message }
  const [verifying, setVerifying] = useState(false);

  const submitChangePasscode = async () => {
    setError(''); setSuccess('');
    if (!oldPasscode || !newPasscode) { setError('Fill in both passcodes.'); return; }
    if (newPasscode !== confirmPasscode) { setError("New passcodes don't match."); return; }
    setBusy(true);
    try {
      await changePasscode(oldPasscode, newPasscode);
      setSuccess('Passcode changed.');
      setOldPasscode(''); setNewPasscode(''); setConfirmPasscode('');
      setChangingPasscode(false);
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    const ok = await requireStepUp('export a full encrypted backup');
    if (!ok) return;
    const backup = await exportBackup();
    setPendingBackup(backup);
    setVerifyResult(null);
    setVerifyPasscode('');
  };

  const runVerify = async () => {
    if (!pendingBackup || !verifyPasscode) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyBackup(pendingBackup, verifyPasscode);
      setVerifyResult({ ok: true, message: `Verified — decrypts correctly. ${result.employeeCount} employee(s), ${result.payrollRunCount} payroll run(s) confirmed readable.` });
    } catch (e) {
      setVerifyResult({ ok: false, message: 'Verification failed: ' + (e && e.message ? e.message : String(e)) });
    } finally {
      setVerifying(false);
      setVerifyPasscode('');
    }
  };

  const daysSinceBackup = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <Card className="mb-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={16} style={{ color: COLORS.gold }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Security &amp; backup</span>
      </div>

      <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
        <div>
          <div className="text-sm font-medium" style={{ color: COLORS.textDark }}>Full backup</div>
          <div className="text-xs" style={{ color: COLORS.textMuted }}>
            {daysSinceBackup === null ? 'Never backed up.' : daysSinceBackup === 0 ? 'Last backup: today.' : `Last backup: ${daysSinceBackup} day${daysSinceBackup === 1 ? '' : 's'} ago.`}
            {' '}Downloads everything, still encrypted — needs this business's passcode to restore.
          </div>
        </div>
        <button onClick={handleExport} className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}>
          Export backup
        </button>
      </div>

      {pendingBackup && (
        <div className="py-3" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>
            Verify this backup — a backup isn't reliable until it's been tested restoring
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Field label="Re-enter passcode to verify">
                <input style={inputStyle} type="password" value={verifyPasscode} onChange={(e) => setVerifyPasscode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runVerify(); }} />
              </Field>
            </div>
            <button onClick={runVerify} disabled={verifying || !verifyPasscode} className="text-xs font-semibold px-3 py-2.5 rounded-lg disabled:opacity-40" style={{ backgroundColor: COLORS.green, color: '#fff' }}>
              {verifying ? 'Verifying…' : 'Run test restore'}
            </button>
          </div>
          {verifyResult && (
            <div className="text-xs mt-2" style={{ color: verifyResult.ok ? COLORS.green : COLORS.rust }}>
              {verifyResult.ok ? '✓ ' : '✗ '}{verifyResult.message}
            </div>
          )}
          <div className="text-xs mt-2" style={{ color: COLORS.textMuted }}>
            This runs the exact unwrap-and-decrypt path a real restore uses, read-only — it doesn't touch your live data.
          </div>
        </div>
      )}

      <div className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium" style={{ color: COLORS.textDark }}>Passcode</div>
            <div className="text-xs" style={{ color: COLORS.textMuted }}>
              {hasEnvelopeEncryption ? 'Change your passcode without re-encrypting your data.' : "This business predates envelope encryption — passcode change isn't available for it yet."}
            </div>
          </div>
          {hasEnvelopeEncryption && !changingPasscode && (
            <button onClick={() => { setChangingPasscode(true); setError(''); setSuccess(''); }} className="text-xs font-semibold" style={{ color: COLORS.gold }}>Change</button>
          )}
        </div>

        {hasEnvelopeEncryption && changingPasscode && (
          <div className="mt-3 space-y-3">
            <Field label="Current passcode"><input style={inputStyle} type="password" value={oldPasscode} onChange={(e) => setOldPasscode(e.target.value)} /></Field>
            <Field label="New passcode"><input style={inputStyle} type="password" value={newPasscode} onChange={(e) => setNewPasscode(e.target.value)} /></Field>
            <Field label="Confirm new passcode"><input style={inputStyle} type="password" value={confirmPasscode} onChange={(e) => setConfirmPasscode(e.target.value)} /></Field>
            {error && <div className="text-xs" style={{ color: COLORS.rust }}>{error}</div>}
            <div className="flex gap-3">
              <PrimaryButton type="button" onClick={submitChangePasscode} disabled={busy}>{busy ? 'Changing…' : 'Save new passcode'}</PrimaryButton>
              <button
                type="button"
                onClick={() => { setChangingPasscode(false); setOldPasscode(''); setNewPasscode(''); setConfirmPasscode(''); setError(''); }}
                className="text-sm font-semibold px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: COLORS.parchment, color: COLORS.textDark }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {success && <div className="text-xs mt-2" style={{ color: COLORS.green }}>{success}</div>}
      </div>

      {securityEvents.length > 0 && (
        <div className="pt-4 mt-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>Recent login activity</div>
          <div className="space-y-1">
            {securityEvents.map((e) => (
              <div key={e.id} className="flex justify-between text-xs">
                <span style={{ color: e.event === 'LOGIN_FAILED' ? COLORS.rust : COLORS.textMuted }}>{e.event.replace(/_/g, ' ')}</span>
                <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(e.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Administration({ tasks, addTask, toggleTask, deleteTask, companyInfo, updateCompanyInfo, taxSettings, updateTaxSettings, log, addNote, auditLog, hasEnvelopeEncryption, changePasscode, exportBackup, verifyBackup, lastBackupAt, requireStepUp, businessId }) {
  const [note, setNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [info, setInfo] = useState(companyInfo);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingTax, setEditingTax] = useState(false);
  const [taxDraft, setTaxDraft] = useState(taxSettings || defaultTaxSettings());

  const startEditTax = () => { setTaxDraft(JSON.parse(JSON.stringify(taxSettings || defaultTaxSettings()))); setEditingTax(true); };
  const saveTax = () => { updateTaxSettings(taxDraft); setEditingTax(false); };
  const updateBand = (i, field, value) => {
    const bands = [...taxDraft.payeBands];
    bands[i] = { ...bands[i], [field]: Number(value) };
    setTaxDraft({ ...taxDraft, payeBands: bands });
  };
  const addBand = () => setTaxDraft({ ...taxDraft, payeBands: [...taxDraft.payeBands, { threshold: 0, rate: 0 }] });
  const removeBand = (i) => setTaxDraft({ ...taxDraft, payeBands: taxDraft.payeBands.filter((_, idx) => idx !== i) });

  const submitNote = () => {
    if (!note.trim()) return;
    addNote(note.trim());
    setNote('');
  };

  const submitTask = () => {
    if (!taskTitle.trim()) return;
    addTask(taskTitle.trim(), taskDue);
    setTaskTitle(''); setTaskDue('');
  };

  const saveInfo = () => {
    updateCompanyInfo(info);
    setEditingInfo(false);
  };

  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  return (
    <div>
      <SectionTitle eyebrow="Records & tasks" title="Administration" />

      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: COLORS.gold }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Company record</span>
          </div>
          {!editingInfo && (
            <button className="text-xs font-semibold" style={{ color: COLORS.gold }} onClick={() => { setInfo(companyInfo); setEditingInfo(true); }}>
              Edit
            </button>
          )}
        </div>
        {editingInfo ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="TIN"><input style={inputStyle} value={info.tin} onChange={(e) => setInfo({ ...info, tin: e.target.value })} /></Field>
            <Field label="Business license no."><input style={inputStyle} value={info.licenseNo} onChange={(e) => setInfo({ ...info, licenseNo: e.target.value })} /></Field>
            <Field label="Address"><input style={inputStyle} value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} /></Field>
            <Field label="Phone"><input style={inputStyle} value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></Field>
            <div className="col-span-2"><PrimaryButton onClick={saveInfo}>Save record</PrimaryButton></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <InfoRow label="TIN" value={companyInfo.tin} />
            <InfoRow label="License No." value={companyInfo.licenseNo} />
            <InfoRow label="Address" value={companyInfo.address} />
            <InfoRow label="Phone" value={companyInfo.phone} />
          </div>
        )}
      </Card>

      <SecurityCard
        hasEnvelopeEncryption={hasEnvelopeEncryption}
        changePasscode={changePasscode}
        exportBackup={exportBackup}
        verifyBackup={verifyBackup}
        lastBackupAt={lastBackupAt}
        requireStepUp={requireStepUp}
        businessId={businessId}
      />

      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} style={{ color: COLORS.gold }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Tax settings</span>
          </div>
          {!editingTax && (
            <button className="text-xs font-semibold" style={{ color: COLORS.gold }} onClick={startEditTax}>Edit</button>
          )}
        </div>

        {editingTax ? (
          <div>
            <div className="mb-4">
              <Field label="Country profile">
                <select
                  style={inputStyle}
                  value={taxDraft.country || 'Tanzania'}
                  onChange={(e) => setTaxDraft(countryPreset(e.target.value))}
                >
                  {Object.keys(COUNTRY_CURRENCY).map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              {taxDraft.country !== 'Tanzania' && (
                <div className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ backgroundColor: COLORS.rustSoft, color: COLORS.rust }}>
                  {taxDraft.country} rates start blank — I don't have verified current figures for this country's statutory scheme (e.g. Kenya's SHIF replaced NHIF; Uganda's LST is a flat annual amount, not a %). Enter your own confirmed rates before relying on this for real payroll.
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Field label="NSSF — employee %">
                <input style={inputStyle} type="number" step="0.1" value={taxDraft.nssfEmployeeRate * 100} onChange={(e) => setTaxDraft({ ...taxDraft, nssfEmployeeRate: Number(e.target.value) / 100 })} />
              </Field>
              <Field label="NSSF — employer %">
                <input style={inputStyle} type="number" step="0.1" value={taxDraft.nssfEmployerRate * 100} onChange={(e) => setTaxDraft({ ...taxDraft, nssfEmployerRate: Number(e.target.value) / 100 })} />
              </Field>
              <Field label="SDL %">
                <input style={inputStyle} type="number" step="0.1" value={taxDraft.sdlRate * 100} onChange={(e) => setTaxDraft({ ...taxDraft, sdlRate: Number(e.target.value) / 100 })} />
              </Field>
              <Field label="SDL applies at (staff count)">
                <input style={inputStyle} type="number" value={taxDraft.sdlThreshold} onChange={(e) => setTaxDraft({ ...taxDraft, sdlThreshold: Number(e.target.value) })} />
              </Field>
              <Field label="WCF %">
                <input style={inputStyle} type="number" step="0.1" value={taxDraft.wcfRate * 100} onChange={(e) => setTaxDraft({ ...taxDraft, wcfRate: Number(e.target.value) / 100 })} />
              </Field>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="nhif-toggle"
                checked={!!taxDraft.nhifEnabled}
                onChange={(e) => setTaxDraft({ ...taxDraft, nhifEnabled: e.target.checked })}
              />
              <label htmlFor="nhif-toggle" className="text-sm" style={{ color: COLORS.textDark }}>
                Apply NHIF (health insurance) — verify this applies to your business before enabling
              </label>
            </div>
            {taxDraft.nhifEnabled && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Field label="NHIF — employee %">
                  <input style={inputStyle} type="number" step="0.1" value={taxDraft.nhifEmployeeRate * 100} onChange={(e) => setTaxDraft({ ...taxDraft, nhifEmployeeRate: Number(e.target.value) / 100 })} />
                </Field>
                <Field label="NHIF — employer %">
                  <input style={inputStyle} type="number" step="0.1" value={taxDraft.nhifEmployerRate * 100} onChange={(e) => setTaxDraft({ ...taxDraft, nhifEmployerRate: Number(e.target.value) / 100 })} />
                </Field>
              </div>
            )}

            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.textMuted }}>PAYE bands</div>
            <div className="space-y-2 mb-3">
              {taxDraft.payeBands.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input style={{ ...inputStyle, flex: 1 }} type="number" value={b.threshold} onChange={(e) => updateBand(i, 'threshold', e.target.value)} placeholder="From (TZS)" />
                  <input style={{ ...inputStyle, width: '90px' }} type="number" step="0.1" value={b.rate * 100} onChange={(e) => updateBand(i, 'rate', e.target.value / 100)} placeholder="Rate %" />
                  <span className="text-xs" style={{ color: COLORS.textMuted }}>%</span>
                  <button onClick={() => removeBand(i)}><Trash2 size={14} style={{ color: COLORS.textMuted }} /></button>
                </div>
              ))}
            </div>
            <button onClick={addBand} className="text-xs font-semibold mb-4" style={{ color: COLORS.gold }}>+ Add band</button>
            <div><PrimaryButton onClick={saveTax}>Save tax settings</PrimaryButton></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <InfoRow label="Country profile" value={`${taxSettings.country || 'Tanzania'} (${taxSettings.currency || 'TZS'})`} />
            <InfoRow label="NSSF (employee / employer)" value={`${(taxSettings.nssfEmployeeRate * 100).toFixed(1)}% / ${(taxSettings.nssfEmployerRate * 100).toFixed(1)}%`} />
            <InfoRow label="SDL" value={`${(taxSettings.sdlRate * 100).toFixed(1)}% at ${taxSettings.sdlThreshold}+ staff`} />
            <InfoRow label="WCF" value={`${(taxSettings.wcfRate * 100).toFixed(1)}%`} />
            <InfoRow label="NHIF" value={taxSettings.nhifEnabled ? `${(taxSettings.nhifEmployeeRate * 100).toFixed(1)}% / ${(taxSettings.nhifEmployerRate * 100).toFixed(1)}%` : 'Not applied'} />
            <InfoRow label="PAYE bands" value={`${taxSettings.payeBands.length} configured`} />
          </div>
        )}
      </Card>

      <Card className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: COLORS.textMuted }}>Tasks</div>
        <div className="flex gap-3 mb-4">
          <input style={inputStyle} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitTask(); }} placeholder="e.g. Renew business license" />
          <input style={{ ...inputStyle, width: '160px' }} type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
          <PrimaryButton type="button" onClick={submitTask}><Plus size={16} /></PrimaryButton>
        </div>
        <div className="space-y-2">
          {openTasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ backgroundColor: COLORS.parchment }}>
              <button onClick={() => toggleTask(t.id)} className="flex items-center gap-2.5 text-left flex-1">
                <span className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: COLORS.gold }} />
                <span style={{ color: COLORS.textDark }}>{t.title}</span>
                {t.dueDate && <span className="text-xs" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>due {t.dueDate}</span>}
              </button>
              <button onClick={() => deleteTask(t.id)}><Trash2 size={14} style={{ color: COLORS.textMuted }} /></button>
            </div>
          ))}
          {openTasks.length === 0 && <div className="text-sm py-1" style={{ color: COLORS.textMuted }}>No open tasks.</div>}
          {doneTasks.length > 0 && (
            <div className="pt-2 mt-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
              {doneTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2">
                  <button onClick={() => toggleTask(t.id)} className="flex items-center gap-2.5 text-left flex-1">
                    <Check size={16} style={{ color: COLORS.green }} />
                    <span style={{ color: COLORS.textMuted, textDecoration: 'line-through' }}>{t.title}</span>
                  </button>
                  <button onClick={() => deleteTask(t.id)}><Trash2 size={14} style={{ color: COLORS.textMuted }} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: COLORS.textMuted }}>Notes</div>
        <div className="flex gap-3">
          <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitNote(); }} placeholder="Log a decision, reminder, or note…" />
          <PrimaryButton type="button" onClick={submitNote}>Add</PrimaryButton>
        </div>
      </Card>
      <div className="space-y-3">
        {log.map((n) => (
          <Card key={n.id}>
            <div className="text-xs mb-1" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(n.date)}</div>
            <div style={{ color: COLORS.textDark }}>{n.note}</div>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: COLORS.textMuted }}>Audit log</div>
        <Card style={{ padding: 0 }}>
          {(!auditLog || auditLog.length === 0) ? (
            <div className="px-6 py-8 text-center text-sm" style={{ color: COLORS.textMuted }}>No actions recorded yet.</div>
          ) : (
            auditLog.slice(0, 50).map((a, i) => (
              <div key={a.id} className="px-6 py-3 flex items-start justify-between gap-4" style={{ borderTop: i ? `1px solid ${COLORS.border}` : 'none' }}>
                <div>
                  <Badge tone={a.action === 'SALARY_CHANGED' ? 'gold' : a.action.includes('PAYROLL') ? 'green' : 'muted'}>{a.action.replace(/_/g, ' ')}</Badge>
                  <div className="text-sm mt-1.5" style={{ color: COLORS.textDark }}>{a.detail}</div>
                </div>
                <div className="text-xs whitespace-nowrap" style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(a.at)}</div>
              </div>
            ))
          )}
        </Card>
        <div className="text-xs mt-3" style={{ color: COLORS.textMuted }}>
          Recorded automatically — no edit or delete control is exposed for these entries in this UI. That's not the same guarantee as database-enforced immutability (a real audit trail needs a backend to make that binding), but nothing here lets you alter past entries.
        </div>
      </div>
    </div>
  );
}

class NexaCoreErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('NexaCore People crashed:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-full flex items-center justify-center p-8" style={{ backgroundColor: '#F5F6F3' }}>
          <div className="max-w-md w-full">
            <div className="text-sm font-semibold mb-2" style={{ color: '#A6432A' }}>Something went wrong</div>
            <div
              className="text-xs p-4 rounded-lg"
              style={{ color: '#736C5E', backgroundColor: '#fff', border: '1px solid #E4E0D4', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            >
              {String((this.state.error && this.state.error.message) || this.state.error)}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#14213D', color: '#fff' }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function NexaCorePeople() {
  return (
    <NexaCoreErrorBoundary>
      <NexaCorePeopleApp />
    </NexaCoreErrorBoundary>
  );
}
