import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode,
  FolderGit2,
  Image as ImageIcon,
  KeyRound,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Terminal,
  Trash2,
} from 'lucide-react';
import { REPO_FILES, RepoFileItem } from './repoFiles';
import {
  botSimulator,
  SIM_USERS,
  SimMessage,
  SimulatorSnapshot,
} from './botSimulator';

type ActiveSection = 'files' | 'simulator' | 'kv' | 'deploy';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('files');
  const [selectedFile, setSelectedFile] = useState<RepoFileItem>(REPO_FILES[0]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [codeSearch, setCodeSearch] = useState('');
  const [kvSearch, setKvSearch] = useState('');
  const [selectedKvKey, setSelectedKvKey] = useState<string>('stock:gmails');

  // Simulator state
  const [simState, setSimState] = useState<SimulatorSnapshot>(() =>
    botSimulator.getSnapshot()
  );
  const [userDraft, setUserDraft] = useState('');
  const [adminDraft, setAdminDraft] = useState('');

  // Deployment generator inputs
  const [workerUrlInput, setWorkerUrlInput] = useState(
    'https://zenox-gmail-bot.your-subdomain.workers.dev'
  );
  const [kvIdInput, setKvIdInput] = useState('e8f9a0b1c2d34567890abcdef1234567');

  const userChatEndRef = useRef<HTMLDivElement>(null);
  const adminChatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = botSimulator.subscribe(() => {
      setSimState(botSimulator.getSnapshot());
    });
    // Trigger initial /start on both clients so keyboards and welcome screens are immediately ready
    botSimulator.sendUserMessage(SIM_USERS.USER.id, '/start');
    botSimulator.sendUserMessage(SIM_USERS.ADMIN.id, '/start');
    return unsub;
  }, []);

  useEffect(() => {
    userChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simState.messages[SIM_USERS.USER.id]?.length]);

  useEffect(() => {
    adminChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simState.messages[SIM_USERS.ADMIN.id]?.length]);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  const handleDownloadSingleFile = (file: RepoFileItem) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllBundle = () => {
    // Download all repository files sequentially or as a combined setup script
    REPO_FILES.forEach((file, index) => {
      setTimeout(() => {
        handleDownloadSingleFile(file);
      }, index * 180);
    });
  };

  const handleResetSimulator = async () => {
    botSimulator.seedInitialState();
    await botSimulator.sendUserMessage(SIM_USERS.USER.id, '/start');
    await botSimulator.sendUserMessage(SIM_USERS.ADMIN.id, '/start');
  };

  const filteredKvEntries = simState.kvEntries.filter(
    (entry) =>
      entry.key.toLowerCase().includes(kvSearch.toLowerCase()) ||
      entry.value.toLowerCase().includes(kvSearch.toLowerCase())
  );

  const activeKvEntry =
    simState.kvEntries.find((e) => e.key === selectedKvKey) ||
    filteredKvEntries[0] ||
    null;

  // Compute live metrics from KV
  const stockCount = (() => {
    const raw = simState.kvEntries.find((e) => e.key === 'stock:gmails')?.value;
    if (!raw) return 0;
    try {
      return JSON.parse(raw).length;
    } catch {
      return 0;
    }
  })();

  const userCount = (() => {
    const raw = simState.kvEntries.find((e) => e.key === 'users:list')?.value;
    if (!raw) return 0;
    try {
      return JSON.parse(raw).length;
    } catch {
      return 0;
    }
  })();

  const pendingSellCount = (() => {
    const raw = simState.kvEntries.find((e) => e.key === 'PENDING_SELL_QUEUE')?.value;
    if (!raw) return 0;
    try {
      return JSON.parse(raw).length;
    } catch {
      return 0;
    }
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-950/95 sticky top-0 z-30">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('files');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Zenox Worker Studio
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveSection('files')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeSection === 'files'
                ? 'text-white border-b-2 border-sky-500'
                : ''
            }`}
          >
            Repository Files
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('simulator')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeSection === 'simulator'
                ? 'text-white border-b-2 border-sky-500'
                : ''
            }`}
          >
            Live Bot Simulator
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('kv')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeSection === 'kv'
                ? 'text-white border-b-2 border-sky-500'
                : ''
            }`}
          >
            KV Storage Inspector
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('deploy')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeSection === 'deploy'
                ? 'text-white border-b-2 border-sky-500'
                : ''
            }`}
          >
            Deployment Guide
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadAllBundle}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Repository Files</span>
          </button>
        </div>
      </header>

      {/* Hero / Workspace Summary Bar */}
      <section className="border-b border-slate-800 bg-slate-900/40 px-6 py-6">
        <div className="max-w-[1380px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
              <span>Cloudflare Workers ES Modules</span>
              <span aria-hidden="true">·</span>
              <span>KV Namespace: env.DB</span>
              <span aria-hidden="true">·</span>
              <span>Buy: ₹22 / Sell: ₹15 / Ref: ₹2 / Min Payout: ₹50</span>
              <span aria-hidden="true">·</span>
              <span>Zero Placeholders</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Single-File Telegram Bot Repository & Dual-Client Worker Sandbox
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Inspect, copy, or download the production-ready{' '}
              <code className="text-sky-300 font-mono">worker.js</code> repository
              files below, or switch to the Live Bot Simulator to test the actual
              Cloudflare Worker script executing against an in-browser{' '}
              <code className="text-sky-300 font-mono">env.DB</code> KV store as both
              a Regular User and the Primary Owner.
            </p>
          </div>

          {/* Interactive Workspace Mode Switcher + Live KV Telemetry */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0">
            <div className="grid grid-cols-3 gap-4 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-right font-mono tabular-nums">
              <div>
                <div className="text-[11px] text-slate-400">KV Stock</div>
                <div className="text-sm font-semibold text-white">{stockCount} accs</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Users</div>
                <div className="text-sm font-semibold text-white">{userCount}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Sell Queue</div>
                <div className="text-sm font-semibold text-sky-400">{pendingSellCount}</div>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveSection('files')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'files'
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Code Repository (6)
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('simulator')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'simulator'
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Live Simulator
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('kv')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'kv'
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                KV DB ({simState.kvEntries.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('deploy')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'deploy'
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                CLI & Webhook
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-6 py-8">
        {/* VIEW 1: REPOSITORY FILES EXPLORER */}
        {activeSection === 'files' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Repository File List & Architecture Summary */}
            <aside className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 text-sky-400" />
                    <span>GitHub Repository Files</span>
                  </h2>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    6 files ready
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-lg overflow-hidden">
                  {REPO_FILES.map((file) => {
                    const isSelected = selectedFile.filename === file.filename;
                    const lineCount = file.content.split('\n').length;
                    return (
                      <div
                        key={file.filename}
                        className={`flex items-center justify-between px-3.5 py-3 transition-colors ${
                          isSelected
                            ? 'bg-slate-800/90 text-white'
                            : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedFile(file)}
                          className="flex items-center gap-2.5 text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <FileCode
                            className={`w-4 h-4 shrink-0 ${
                              isSelected ? 'text-sky-400' : 'text-slate-400'
                            }`}
                          />
                          <div className="truncate">
                            <div className="text-xs font-mono font-semibold truncate">
                              {file.filename}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                              {lineCount} lines · {(file.content.length / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(file.content, `sidebar_${file.filename}`)}
                            title={`Copy ${file.filename}`}
                            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700/60 transition-colors cursor-pointer"
                          >
                            {copiedKey === `sidebar_${file.filename}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleFile(file)}
                            title={`Download ${file.filename}`}
                            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700/60 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSection('simulator')}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-sky-400" />
                  <span>Test worker.js in Live Dual-Client Simulator</span>
                </button>
              </div>

              {/* Technical Spec Verification Checklist */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Implemented Modules in worker.js
                </h3>
                <ul className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong className="text-white">A. Force Join & ₹2 Referral:</strong>{' '}
                    Live <code className="font-mono text-sky-300">getChatMember</code> gate on{' '}
                    <code className="font-mono text-sky-300">/start</code> & all interactions;
                    credits ₹2 to referrer wallet on verification.
                  </li>
                  <li>
                    <strong className="text-white">B. Buy Gmail (₹22):</strong> Quantity
                    prompt → Invoice & <code className="font-mono text-sky-300">UPI_DETAILS</code>{' '}
                    → UTR/Photo proof → Admin approve pops from{' '}
                    <code className="font-mono text-sky-300">stock:gmails</code> & DMs buyer.
                  </li>
                  <li>
                    <strong className="text-white">C. Sell Gmail (₹15):</strong> Validates{' '}
                    <code className="font-mono text-sky-300">email:password:recovery</code> →{' '}
                    <code className="font-mono text-sky-300">PENDING_SELL_QUEUE</code> → Admin
                    approve credits ₹15/acc + adds to active stock.
                  </li>
                  <li>
                    <strong className="text-white">D. Wallet & Payouts (Min ₹50):</strong>{' '}
                    Balance check, UPI/USDT payout request, Admin Mark Paid or Reject &
                    Automatic Refund.
                  </li>
                  <li>
                    <strong className="text-white">E. Interactive Settings:</strong> Inline
                    toggles for Hindi/English, Notifications ON/OFF, and INR/USDT (1 USDT =
                    ₹90).
                  </li>
                  <li>
                    <strong className="text-white">F. Admin Control Panel:</strong> Row 5{' '}
                    <code className="font-mono text-sky-300">⚡ Admin Dashboard</code> visible
                    strictly to <code className="font-mono text-sky-300">OWNER_ID</code> & KV
                    sub-admins.
                  </li>
                </ul>
              </div>
            </aside>

            {/* Right Code Viewer Panel */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-white">
                      {selectedFile.filename}
                    </span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      · {selectedFile.content.split('\n').length} lines
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedFile.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={codeSearch}
                      onChange={(e) => setCodeSearch(e.target.value)}
                      placeholder="Filter lines..."
                      className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 w-40"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(selectedFile.content, `main_${selectedFile.filename}`)
                    }
                    className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedKey === `main_${selectedFile.filename}` ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy File</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadSingleFile(selectedFile)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[720px] overflow-y-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed select-text">
                <table className="w-full border-collapse">
                  <tbody>
                    {selectedFile.content
                      .split('\n')
                      .map((line, idx) => ({ line, num: idx + 1 }))
                      .filter(
                        (item) =>
                          !codeSearch.trim() ||
                          item.line.toLowerCase().includes(codeSearch.toLowerCase())
                      )
                      .map(({ line, num }) => (
                        <tr key={num} className="hover:bg-slate-900/70">
                          <td className="select-none pr-4 text-right text-slate-600 tabular-nums w-12 align-top">
                            {num}
                          </td>
                          <td className="text-slate-200 whitespace-pre font-mono">
                            {line || ' '}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: LIVE DUAL-CLIENT TELEGRAM BOT SIMULATOR */}
        {activeSection === 'simulator' && (
          <div className="space-y-6">
            {/* Simulator Controls Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-white">
                  Interactive Dual-Client Worker Simulator (Executes /worker.js Live)
                </h2>
                <p className="text-xs text-slate-400">
                  Left client simulates Regular User <code className="text-sky-300">800101</code>{' '}
                  (4-row keyboard). Right client simulates Primary Owner{' '}
                  <code className="text-sky-300">999001</code> (5-row keyboard with{' '}
                  <code className="text-sky-300">⚡ Admin Dashboard</code>). Both share the
                  same live <code className="text-sky-300">env.DB</code> KV store.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const current =
                      simState.channelMemberships[SIM_USERS.USER.id] ?? true;
                    botSimulator.setChannelMembership(SIM_USERS.USER.id, !current);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    simState.channelMemberships[SIM_USERS.USER.id]
                      ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-300'
                      : 'bg-amber-950/60 border-amber-700/70 text-amber-300'
                  }`}
                >
                  {simState.channelMemberships[SIM_USERS.USER.id]
                    ? 'Channel Status: Joined @ZenoxUpdates (Click to Leave)'
                    : 'Channel Status: Not Joined (Force-Join Gate Active)'}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    // Simulate new referral join by setting User as not joined, sending /start 999001, then verifying
                    botSimulator.setChannelMembership(SIM_USERS.USER.id, false);
                    await botSimulator.sendUserMessage(
                      SIM_USERS.USER.id,
                      `/start ${SIM_USERS.ADMIN.id}`
                    );
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Test Force-Join + ₹2 Referral Flow
                </button>

                <button
                  type="button"
                  onClick={handleResetSimulator}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset KV & Chats</span>
                </button>
              </div>
            </div>

            {/* Dual Telegram Clients Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* LEFT: REGULAR USER CLIENT */}
              <TelegramClientPane
                title="Regular User Telegram Client"
                subtitle={`${SIM_USERS.USER.first_name} · chat_id: ${SIM_USERS.USER.id} · Standard 4-Row Keyboard`}
                chatId={SIM_USERS.USER.id}
                messages={simState.messages[SIM_USERS.USER.id] || []}
                replyKeyboard={simState.replyKeyboards[SIM_USERS.USER.id] || []}
                toast={simState.toasts[SIM_USERS.USER.id] || null}
                draft={userDraft}
                setDraft={setUserDraft}
                chatEndRef={userChatEndRef}
                quickActions={[
                  { label: '/start', text: '/start' },
                  {
                    label: 'Paste Sample Gmail to Sell',
                    text: 'neha.kapoor88@gmail.com:Neha@9921:recov.neha@gmail.com',
                  },
                  {
                    label: 'Send Sample 12-Digit UTR',
                    text: 'UTR 431988271652 Paid via PhonePe',
                  },
                ]}
                allowMockPhoto={true}
              />

              {/* RIGHT: ADMIN / OWNER CLIENT */}
              <TelegramClientPane
                title="Owner / Admin Telegram Client"
                subtitle={`${SIM_USERS.ADMIN.first_name} · OWNER_ID: ${SIM_USERS.ADMIN.id} · Row 5 Admin Dashboard Enabled`}
                chatId={SIM_USERS.ADMIN.id}
                messages={simState.messages[SIM_USERS.ADMIN.id] || []}
                replyKeyboard={simState.replyKeyboards[SIM_USERS.ADMIN.id] || []}
                toast={simState.toasts[SIM_USERS.ADMIN.id] || null}
                draft={adminDraft}
                setDraft={setAdminDraft}
                chatEndRef={adminChatEndRef}
                quickActions={[
                  { label: '⚡ Admin Dashboard', text: '⚡ Admin Dashboard' },
                  {
                    label: 'Paste 2 Bulk Stock Accounts',
                    text: 'stock.alpha1@gmail.com:Alpha#111:rec.alpha1@gmail.com\nstock.alpha2@gmail.com:Alpha#222:rec.alpha2@gmail.com',
                  },
                  { label: '/start', text: '/start' },
                ]}
                allowMockPhoto={false}
              />
            </div>
          </div>
        )}

        {/* VIEW 3: CLOUDFLARE KV STORAGE INSPECTOR */}
        {activeSection === 'kv' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Cloudflare KV Keys (env.DB)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Live state updated by every bot interaction
                  </p>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={kvSearch}
                    onChange={(e) => setKvSearch(e.target.value)}
                    placeholder="Filter keys..."
                    className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 w-36"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-800 max-h-[540px] overflow-y-auto">
                {filteredKvEntries.map((entry) => {
                  const isSelected = activeKvEntry?.key === entry.key;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => setSelectedKvKey(entry.key)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800 text-white'
                          : 'hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <span className="font-mono text-xs font-medium truncate text-sky-300">
                        {entry.key}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                        {entry.value.length} B
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Selected KV Key</div>
                  <div className="text-sm font-mono font-bold text-white">
                    {activeKvEntry ? activeKvEntry.key : 'None Selected'}
                  </div>
                </div>
                {activeKvEntry && (
                  <button
                    type="button"
                    onClick={() => handleCopy(activeKvEntry.value, 'kv_val')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey === 'kv_val' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied JSON</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="p-5 bg-slate-950 font-mono text-xs text-slate-200 overflow-x-auto max-h-[540px] overflow-y-auto">
                {activeKvEntry ? (
                  <pre className="whitespace-pre-wrap break-all">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(activeKvEntry.value), null, 2);
                      } catch {
                        return activeKvEntry.value;
                      }
                    })()}
                  </pre>
                ) : (
                  <div className="text-slate-500">Select a KV key to inspect its JSON payload.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: DEPLOYMENT & WEBHOOK CONFIGURATOR */}
        {activeSection === 'deploy' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-sky-400" />
                <span>Interactive Webhook & Wrangler Configurator</span>
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Customize your Worker URL and KV Namespace ID below to generate ready-to-run
                deployment and webhook registration commands.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cloudflare Worker URL
                  </label>
                  <input
                    type="text"
                    value={workerUrlInput}
                    onChange={(e) => setWorkerUrlInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cloudflare KV Namespace ID (DB)
                  </label>
                  <input
                    type="text"
                    value={kvIdInput}
                    onChange={(e) => setKvIdInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-white">
                  1-Click Auto Webhook Registration Route
                </div>
                <p className="text-xs text-slate-400">
                  <code className="font-mono text-sky-300">worker.js</code> includes a built-in{' '}
                  <code className="font-mono text-sky-300">GET /register-webhook</code> route.
                  After deploying, simply visit this URL in your browser:
                </p>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-sky-300 break-all flex items-center justify-between gap-2">
                  <span>{workerUrlInput.replace(/\/$/, '')}/register-webhook</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        `${workerUrlInput.replace(/\/$/, '')}/register-webhook`,
                        'webhook_url'
                      )
                    }
                    className="p-1.5 text-slate-400 hover:text-white rounded bg-slate-900 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'webhook_url' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <span>Step-by-Step Terminal Commands</span>
                </h3>
              </div>

              {[
                {
                  step: '01. Install Wrangler & Authenticate',
                  cmd: `npm install\nnpx wrangler login`,
                },
                {
                  step: '02. Create Cloudflare KV Namespace (DB)',
                  cmd: `npx wrangler kv namespace create DB\nnpx wrangler kv namespace create DB --preview`,
                },
                {
                  step: '03. Set Secret BOT_TOKEN & Deploy Worker',
                  cmd: `npx wrangler secret put BOT_TOKEN\nnpx wrangler deploy`,
                },
                {
                  step: '04. Register Telegram Webhook via cURL (or open /register-webhook)',
                  cmd: `curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url": "${workerUrlInput.replace(/\/$/, '')}/", "drop_pending_updates": true}'`,
                },
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">
                      {item.step}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.cmd, `cmd_${idx}`)}
                      className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === `cmd_${idx}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-slate-200 overflow-x-auto">
                    {item.cmd}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-900 px-6 py-4 text-xs text-slate-500">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Zenox Gmail Exchange · Single-File Cloudflare Workers Telegram Bot (ES Modules + KV)
          </span>
          <span className="font-mono tabular-nums">
            Support: @ZenoxWorker · Buy: ₹22 · Sell: ₹15 · Referral: ₹2 · Min Payout: ₹50
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * Reusable Simulated Telegram Client Component
 */
function TelegramClientPane({
  title,
  subtitle,
  chatId,
  messages,
  replyKeyboard,
  toast,
  draft,
  setDraft,
  chatEndRef,
  quickActions,
  allowMockPhoto,
}: {
  title: string;
  subtitle: string;
  chatId: string;
  messages: SimMessage[];
  replyKeyboard: { text: string }[][];
  toast: { id: string; text: string; show_alert?: boolean } | null;
  draft: string;
  setDraft: (v: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  quickActions: Array<{ label: string; text: string }>;
  allowMockPhoto: boolean;
}) {
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const text = draft;
    setDraft('');
    await botSimulator.sendUserMessage(chatId, text, false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden h-[760px]">
      {/* Client Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-white">{title}</div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            {subtitle}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {quickActions.map((qa, i) => (
            <button
              key={i}
              type="button"
              onClick={() => botSimulator.sendUserMessage(chatId, qa.text)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-sky-300 rounded transition-colors cursor-pointer whitespace-nowrap"
            >
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      {/* Callback Query Toast / Alert Banner */}
      {toast && (
        <div className="px-4 py-2 bg-sky-950 border-b border-sky-800 text-sky-200 text-xs flex items-center justify-between">
          <span>
            <strong>{toast.show_alert ? 'Telegram Alert:' : 'Toast:'}</strong> {toast.text}
          </span>
          <button
            type="button"
            onClick={() => botSimulator.clearToast(chatId)}
            className="text-sky-400 hover:text-white text-xs font-semibold ml-3 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/80">
        {messages.map((msg) => {
          const isBot = msg.sender === 'bot';
          return (
            <div
              key={msg.message_id}
              className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  isBot
                    ? 'bg-slate-900 border border-slate-800 text-slate-100'
                    : 'bg-sky-600 text-white'
                }`}
              >
                {msg.photo && (
                  <div className="mb-2 px-3 py-2 bg-slate-950/60 border border-slate-700/60 rounded text-[11px] font-mono text-sky-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Photo: {msg.photo}</span>
                  </div>
                )}
                <div
                  className="whitespace-pre-wrap break-words [&_b]:font-bold [&_b]:text-white [&_code]:font-mono [&_code]:bg-slate-950/90 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sky-300"
                  dangerouslySetInnerHTML={{ __html: msg.text }}
                />
                <div
                  className={`text-[10px] mt-1 text-right font-mono tabular-nums ${
                    isBot ? 'text-slate-500' : 'text-sky-200'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {/* Inline Keyboard Buttons */}
              {msg.inline_keyboard && msg.inline_keyboard.length > 0 && (
                <div className="mt-1.5 w-full max-w-[88%] space-y-1">
                  {msg.inline_keyboard.map((row, rIdx) => (
                    <div key={rIdx} className="grid grid-cols-1 sm:grid-flow-col gap-1">
                      {row.map((btn, bIdx) => (
                        <button
                          key={bIdx}
                          type="button"
                          onClick={() => {
                            if (btn.callback_data) {
                              botSimulator.triggerCallbackQuery(
                                chatId,
                                msg.message_id,
                                btn.callback_data
                              );
                            } else if (btn.url) {
                              // Toggle channel join automatically if clicking Join @ZenoxUpdates in simulator
                              if (btn.text.includes('Join')) {
                                botSimulator.setChannelMembership(chatId, true);
                              }
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-sky-300 font-medium text-xs rounded-lg transition-colors text-center truncate cursor-pointer"
                        >
                          {btn.text}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Text / Photo Input Bar */}
      <form
        onSubmit={handleSend}
        className="p-2.5 border-t border-slate-800 bg-slate-900 flex items-center gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type message, quantity, email:pass:rec, or /command..."
          className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
        {allowMockPhoto && (
          <button
            type="button"
            onClick={() =>
              botSimulator.sendUserMessage(
                chatId,
                draft || 'Paid via UPI QR Screenshot',
                true
              )
            }
            title="Send Mock Payment Screenshot Photo"
            className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Screenshot</span>
          </button>
        )}
        <button
          type="submit"
          className="px-3 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>

      {/* Persistent Bottom Reply Keyboard */}
      {replyKeyboard.length > 0 && (
        <div className="p-2.5 bg-slate-950 border-t border-slate-800 space-y-1.5">
          <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between px-1">
            <span>Persistent Bottom Reply Keyboard (resize_keyboard: true)</span>
            <span>{replyKeyboard.length} rows</span>
          </div>
          {replyKeyboard.map((row, rIdx) => (
            <div
              key={rIdx}
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
              }}
            >
              {row.map((btn, bIdx) => {
                const isAdminBtn = btn.text.includes('Admin Dashboard');
                return (
                  <button
                    key={bIdx}
                    type="button"
                    onClick={() => botSimulator.sendUserMessage(chatId, btn.text)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium transition-colors truncate cursor-pointer ${
                      isAdminBtn
                        ? 'bg-sky-500/20 border border-sky-500/50 text-sky-200 hover:bg-sky-500/30 font-semibold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/70'
                    }`}
                  >
                    {btn.text}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
