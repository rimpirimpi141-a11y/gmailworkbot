/**
 * Zenox Mail & Social Master Pro — Production Telegram Bot on Cloudflare Workers (ES Modules)
 * Storage & State Management: Cloudflare KV (bound as `env.DB`)
 * Supports: Gmail & Facebook Account Buying/Selling, Colon-Free Credential Formatting,
 * Recovery Security Notices, Mail Master Pro Style Admin Panel, Dynamic Rates,
 * User Inspection & Balance Controls, and ₹100 Minimum Withdrawal.
 */

const DEFAULT_CONFIG = {
  BUY_GMAIL_INR: 22,
  SELL_GMAIL_INR: 15,
  BUY_FB_INR: 30,
  SELL_FB_INR: 20,
  REF_BONUS_INR: 2,
  MIN_WITHDRAW_INR: 100, // Strictly ₹100 minimum withdrawal
  USDT_RATE_INR: 90, // 1 USDT = ₹90
};

const BUTTONS = {
  BUY_GMAIL: "🛒 Buy Gmail",
  SELL_GMAIL: "📥 Sell Gmail",
  BUY_FB: "📘 Buy Facebook",
  SELL_FB: "📤 Sell Facebook",
  WALLET: "💼 My Wallet & Payout",
  ORDERS: "📦 My Orders",
  REFER: "👥 Refer & Earn",
  SETTINGS: "⚙️ Settings",
  UPDATES: "📢 Updates Channel",
  SUPPORT_PREFIX: "💬 Support",
  ADMIN: "⚡ Admin Dashboard",
  CANCEL: "❌ Cancel Action",
};

const ADMIN_BUTTONS = {
  ADD_GMAIL_STOCK: "➕ Add Gmail Stock",
  ADD_FB_STOCK: "➕ Add FB Stock",
  STATS: "📊 Inventory & Stats",
  USER_LIST: "👥 View User List",
  INSPECT_USER: "🔍 Inspect User",
  RATES_CONFIG: "⚙️ Set Rates & Min Withdraw",
  PENDING_BUYS: "🛒 Pending Buy Orders",
  PENDING_SELLS: "📥 Pending Sell Queue",
  PAYOUTS: "💳 Pending Payouts",
  ADMINS: "🛡 Admin Manager",
  BROADCAST: "📢 Broadcast Message",
  MAINTENANCE: "🔧 Maintenance Mode",
  BACK_HOME: "🏠 Exit Admin Panel",
};

/**
 * Lightweight Telegram Bot API fetch helper
 */
export async function callApi(token, method, payload = {}) {
  if (typeof globalThis.__SIMULATOR_API_HANDLER__ === "function") {
    return await globalThis.__SIMULATOR_API_HANDLER__(method, payload, token);
  }
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`Telegram API Error [${method}]:`, data.description || data);
    }
    return data;
  } catch (err) {
    console.error(`Fetch Exception [${method}]:`, err);
    return { ok: false, description: err.message };
  }
}

/**
 * Escape HTML special characters for Telegram HTML parse_mode
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * KV Storage Helpers
 */
async function getJson(db, key, fallback = null) {
  try {
    const raw = await db.get(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function putJson(db, key, value) {
  await db.put(key, JSON.stringify(value));
}

/**
 * Load Dynamic System Configuration from KV (`system:config`)
 */
async function getSystemConfig(db) {
  const saved = await getJson(db, "system:config", {});
  return {
    ...DEFAULT_CONFIG,
    ...saved,
  };
}

async function saveSystemConfig(db, newPartial) {
  const current = await getSystemConfig(db);
  const updated = { ...current, ...newPartial };
  await putJson(db, "system:config", updated);
  return updated;
}

/**
 * Currency formatter supporting dynamic INR (₹) and USDT ($) conversion
 */
function formatCurrency(amountInr, currency = "INR", usdtRate = DEFAULT_CONFIG.USDT_RATE_INR) {
  const num = Number(amountInr) || 0;
  const rate = Number(usdtRate) || 90;
  if (currency === "USDT") {
    const usdt = (num / rate).toFixed(2);
    return `$${usdt} USDT (₹${num})`;
  }
  const usdtEquiv = (num / rate).toFixed(2);
  return `₹${num} (~$${usdtEquiv})`;
}

/**
 * Generate short unique ID for orders, sells, and payouts
 */
function generateId(prefix = "ORD") {
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

/**
 * Clean Account Credential Parser & Formatter (No Colons / Special Separators Required)
 * Accepts clean space-separated lines: `emailOrUid password [optionalRecovery]`
 * Also gracefully normalizes legacy inputs if a user pastes colons/pipes so nothing breaks.
 */
function parseSubmittedAccountLines(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const validAccounts = [];
  const invalidLines = [];

  for (const line of lines) {
    // Normalize any accidental colons, pipes, or commas into clean spaces
    const normalized = line.replace(/[:|,;]+/g, " ").replace(/\s+/g, " ").trim();
    const tokens = normalized.split(" ");

    if (tokens.length >= 2 && tokens[0].length >= 4 && tokens[1].length >= 3) {
      const identifier = tokens[0].trim();
      const password = tokens[1].trim();
      const recovery = tokens.length >= 3 ? tokens.slice(2).join(" ").trim() : "";

      validAccounts.push({
        identifier,
        password,
        recovery:
          recovery && recovery.toLowerCase() !== "none" && recovery.toLowerCase() !== "na"
            ? recovery
            : "",
        raw_clean: recovery ? `${identifier} ${password} ${recovery}` : `${identifier} ${password}`,
      });
    } else {
      invalidLines.push(line);
    }
  }

  return { validAccounts, invalidLines };
}

/**
 * Normalize a stored stock item (whether stored as object or string) into clean object
 */
function normalizeStockEntry(entry) {
  if (entry && typeof entry === "object" && entry.identifier) {
    return {
      identifier: entry.identifier,
      password: entry.password,
      recovery: entry.recovery || "",
    };
  }
  const { validAccounts } = parseSubmittedAccountLines(String(entry || ""));
  if (validAccounts.length > 0) {
    return validAccounts[0];
  }
  return {
    identifier: String(entry || "unknown"),
    password: "N/A",
    recovery: "",
  };
}

/**
 * Format an account cleanly WITHOUT colons and WITH proper Recovery Line / Security Notice
 */
function formatCredentialCard(entry, index = null, platform = "GMAIL") {
  const acc = normalizeStockEntry(entry);
  const prefix = index !== null ? `<b>#${index + 1}</b>\n` : "";
  const idLabel = platform === "FACEBOOK" ? "📘 FB Account / UID" : "📧 Gmail Address";

  const recoveryLine = acc.recovery
    ? `🛡 <b>Recovery Mail Notice</b> — <code>${escapeHtml(acc.recovery)}</code>\n   <i>(Recovery mail is attached; update recovery & password immediately after sign-in)</i>`
    : `🛡 <b>Recovery Mail Notice</b> — <b>No Recovery Mail Linked (Fresh Account)</b>\n   <i>(Direct login ready — bind your own recovery email & 2FA immediately)</i>`;

  return (
    `${prefix}` +
    `${idLabel} — <code>${escapeHtml(acc.identifier)}</code>\n` +
    `🔑 <b>Password</b> — <code>${escapeHtml(acc.password)}</code>\n` +
    `${recoveryLine}`
  );
}

/**
 * Bilingual Dictionary (English & Hindi)
 */
const I18N = {
  en: {
    welcome: (name, cfg) =>
      `👋 <b>Welcome to Zenox Mail & Social Master Pro, ${escapeHtml(name)}!</b>\n\n` +
      `Automated, instant-delivery marketplace for verified Gmail & Facebook accounts.\n\n` +
      `🛒 <b>Buy Gmail:</b> ₹${cfg.BUY_GMAIL_INR} / account\n` +
      `📥 <b>Sell Gmail:</b> ₹${cfg.SELL_GMAIL_INR} / account\n` +
      `📘 <b>Buy Facebook:</b> ₹${cfg.BUY_FB_INR} / account\n` +
      `📤 <b>Sell Facebook:</b> ₹${cfg.SELL_FB_INR} / account\n` +
      `👥 <b>Refer & Earn:</b> ₹${cfg.REF_BONUS_INR} per verified user\n` +
      `🏦 <b>Min Withdrawal:</b> ₹${cfg.MIN_WITHDRAW_INR} (UPI / USDT)\n\n` +
      `Select a service from the menu below to get started:`,
    force_join: (channel) =>
      `🔒 <b>Mandatory Channel Verification</b>\n\n` +
      `To use this bot and access automated Gmail & Facebook trading, you must join our official updates channel first:\n` +
      `👉 <b>${escapeHtml(channel)}</b>\n\n` +
      `Click the button below to join, then tap <b>"✅ Verify Membership"</b>.`,
    maintenance_active: (support) =>
      `🛠 <b>System Under Scheduled Maintenance</b>\n\n` +
      `Our automated trading queues are temporarily paused for stock auditing and upgrades.\n` +
      `Please try again shortly or contact ${escapeHtml(support)} for urgent queries.`,
    cancelled: "✅ Current operation cancelled. Returned to main menu.",
    settings_title: (user, fmt, cfg) =>
      `⚙️ <b>Account Preferences & Settings</b>\n\n` +
      `• <b>Language:</b> ${user.lang === "hi" ? "🇮🇳 Hindi (हिंदी)" : "🇬🇧 English"}\n` +
      `• <b>Notifications:</b> ${user.notifications !== false ? "🔔 ON" : "🔕 OFF"}\n` +
      `• <b>Display Currency:</b> ${user.currency === "USDT" ? "💵 USDT ($)" : "🇮🇳 INR (₹)"}\n` +
      `• <b>Conversion Rate:</b> 1 USDT = ₹${cfg.USDT_RATE_INR}\n` +
      `• <b>Minimum Withdrawal:</b> ₹${cfg.MIN_WITHDRAW_INR}\n` +
      `• <b>Current Balance:</b> ${fmt(user.balance || 0)}\n\n` +
      `Tap any button below to toggle your preferences instantly:`,
  },
  hi: {
    welcome: (name, cfg) =>
      `👋 <b>Zenox Mail & Social Master Pro में आपका स्वागत है, ${escapeHtml(name)}!</b>\n\n` +
      `यहाँ आप तुरंत वेरिफाइड Gmail और Facebook अकाउंट खरीद और बेच सकते हैं।\n\n` +
      `🛒 <b>Gmail खरीदें:</b> ₹${cfg.BUY_GMAIL_INR} प्रति अकाउंट\n` +
      `📥 <b>Gmail बेचें:</b> ₹${cfg.SELL_GMAIL_INR} प्रति अकाउंट\n` +
      `📘 <b>Facebook खरीदें:</b> ₹${cfg.BUY_FB_INR} प्रति अकाउंट\n` +
      `📤 <b>Facebook बेचें:</b> ₹${cfg.SELL_FB_INR} प्रति अकाउंट\n` +
      `👥 <b>रेफर और कमाएं:</b> ₹${cfg.REF_BONUS_INR} प्रति वेरिफाइड यूजर\n` +
      `🏦 <b>न्यूनतम निकासी:</b> ₹${cfg.MIN_WITHDRAW_INR} (UPI / USDT)\n\n` +
      `शुरू करने के लिए नीचे दिए गए मेनू से विकल्प चुनें:`,
    force_join: (channel) =>
      `🔒 <b>चैनल ज्वाइन करना अनिवार्य है</b>\n\n` +
      `इस बॉट का उपयोग करने के लिए आपको हमारे ऑफिशियल चैनल से जुड़ना होगा:\n` +
      `👉 <b>${escapeHtml(channel)}</b>\n\n` +
      `नीचे दिए गए बटन से चैनल ज्वाइन करें और फिर <b>"✅ Verify Membership"</b> दबाएं।`,
    maintenance_active: (support) =>
      `🛠 <b>बॉट मेंटेनेंस मोड में है</b>\n\n` +
      `सिस्टम अपग्रेड के कारण सेवाएं कुछ समय के लिए रुकी हुई हैं। कृपया थोड़ी देर बाद प्रयास करें या ${escapeHtml(support)} से संपर्क करें।`,
    cancelled: "✅ प्रक्रिया रद्द कर दी गई है। मुख्य मेनू पर वापस आ गए हैं।",
    settings_title: (user, fmt, cfg) =>
      `⚙️ <b>अकाउंट सेटिंग्स</b>\n\n` +
      `• <b>भाषा (Language):</b> ${user.lang === "hi" ? "🇮🇳 हिंदी (Hindi)" : "🇬🇧 English"}\n` +
      `• <b>नोटिफिकेशन:</b> ${user.notifications !== false ? "🔔 चालू (ON)" : "🔕 बंद (OFF)"}\n` +
      `• <b>मुद्रा (Currency):</b> ${user.currency === "USDT" ? "💵 USDT ($)" : "🇮🇳 INR (₹)"}\n` +
      `• <b>एक्सचेंज रेट:</b> 1 USDT = ₹${cfg.USDT_RATE_INR}\n` +
      `• <b>न्यूनतम निकासी:</b> ₹${cfg.MIN_WITHDRAW_INR}\n` +
      `• <b>आपका बैलेंस:</b> ${fmt(user.balance || 0)}\n\n` +
      `अपनी सेटिंग्स बदलने के लिए नीचे दिए गए बटन दबाएं:`,
  },
};

/**
 * User Profile Management in KV
 */
async function getUserData(db, chatId, fromUser = {}) {
  const key = `user:${chatId}:data`;
  let user = await getJson(db, key, null);
  const now = new Date().toISOString();
  if (!user) {
    user = {
      id: String(chatId),
      first_name: fromUser.first_name || "User",
      username: fromUser.username || "",
      balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
      referred_by: null,
      ref_rewarded: false,
      referral_count: 0,
      referral_earnings: 0,
      lang: "en",
      notifications: true,
      currency: "INR",
      banned: false,
      orders: [],
      sells: [],
      payouts: [],
      joined_at: now,
      updated_at: now,
    };
    await putJson(db, key, user);
    const usersList = await getJson(db, "users:list", []);
    if (!usersList.includes(String(chatId))) {
      usersList.push(String(chatId));
      await putJson(db, "users:list", usersList);
    }
  } else {
    let dirty = false;
    if (fromUser.first_name && user.first_name !== fromUser.first_name) {
      user.first_name = fromUser.first_name;
      dirty = true;
    }
    if (fromUser.username !== undefined && user.username !== fromUser.username) {
      user.username = fromUser.username;
      dirty = true;
    }
    if (dirty) {
      user.updated_at = now;
      await putJson(db, key, user);
    }
  }
  return user;
}

async function saveUserData(db, chatId, user) {
  user.updated_at = new Date().toISOString();
  await putJson(db, `user:${chatId}:data`, user);
}

async function getUserState(db, chatId) {
  return await getJson(db, `user:${chatId}:state`, { action: "IDLE", meta: {} });
}

async function setUserState(db, chatId, action, meta = {}) {
  if (!action || action === "IDLE") {
    await db.delete(`user:${chatId}:state`);
  } else {
    await putJson(db, `user:${chatId}:state`, { action, meta, updated_at: Date.now() });
  }
}

/**
 * Check if a chatId is Owner or in KV `admins:list`
 */
async function isAdminUser(db, env, chatId) {
  const idStr = String(chatId);
  if (env.OWNER_ID && idStr === String(env.OWNER_ID).trim()) {
    return true;
  }
  const admins = await getJson(db, "admins:list", []);
  return admins.map(String).includes(idStr);
}

/**
 * Get all admin IDs (Owner + Sub-admins) for notifications
 */
async function getAllAdminIds(db, env) {
  const set = new Set();
  if (env.OWNER_ID) set.add(String(env.OWNER_ID).trim());
  const admins = await getJson(db, "admins:list", []);
  for (const a of admins) {
    if (a) set.add(String(a).trim());
  }
  return Array.from(set);
}

/**
 * Notify all admins via Telegram message
 */
async function notifyAdmins(db, env, text, replyMarkup = undefined) {
  const adminIds = await getAllAdminIds(db, env);
  for (const adminId of adminIds) {
    const payload = {
      chat_id: adminId,
      text,
      parse_mode: "HTML",
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await callApi(env.BOT_TOKEN, "sendMessage", payload);
  }
}

/**
 * Build persistent Bottom Reply Keyboard for Regular Users vs Admins
 */
function buildMainKeyboard(env, isAdmin) {
  const supportUsername = env.SUPPORT_USERNAME || "@ZenoxWorker";
  const rows = [
    [{ text: BUTTONS.BUY_GMAIL }, { text: BUTTONS.SELL_GMAIL }],
    [{ text: BUTTONS.BUY_FB }, { text: BUTTONS.SELL_FB }],
    [{ text: BUTTONS.WALLET }, { text: BUTTONS.ORDERS }],
    [{ text: BUTTONS.REFER }, { text: BUTTONS.SETTINGS }],
    [{ text: BUTTONS.UPDATES }, { text: `${BUTTONS.SUPPORT_PREFIX} (${supportUsername})` }],
  ];
  if (isAdmin) {
    rows.push([{ text: BUTTONS.ADMIN }]);
  }
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
  };
}

/**
 * Build Mail Master Pro Style Admin Dashboard Bottom Reply Keyboard
 */
function buildAdminKeyboard() {
  return {
    keyboard: [
      [{ text: ADMIN_BUTTONS.STATS }, { text: ADMIN_BUTTONS.RATES_CONFIG }],
      [{ text: ADMIN_BUTTONS.ADD_GMAIL_STOCK }, { text: ADMIN_BUTTONS.ADD_FB_STOCK }],
      [{ text: ADMIN_BUTTONS.USER_LIST }, { text: ADMIN_BUTTONS.INSPECT_USER }],
      [{ text: ADMIN_BUTTONS.PENDING_BUYS }, { text: ADMIN_BUTTONS.PENDING_SELLS }],
      [{ text: ADMIN_BUTTONS.PAYOUTS }, { text: ADMIN_BUTTONS.ADMINS }],
      [{ text: ADMIN_BUTTONS.BROADCAST }, { text: ADMIN_BUTTONS.MAINTENANCE }],
      [{ text: ADMIN_BUTTONS.BACK_HOME }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/**
 * Cancel keyboard during multi-step input flows
 */
function buildCancelKeyboard() {
  return {
    keyboard: [[{ text: BUTTONS.CANCEL }]],
    resize_keyboard: true,
  };
}

/**
 * Force Channel Join Verification & Referral Bonus Trigger
 */
async function checkForceChannelMembership(env, userId) {
  const forceChannel = (env.FORCE_CHANNEL || "").trim();
  if (!forceChannel) return true;
  if (env.OWNER_ID && String(userId) === String(env.OWNER_ID).trim()) return true;

  const res = await callApi(env.BOT_TOKEN, "getChatMember", {
    chat_id: forceChannel,
    user_id: userId,
  });

  if (!res || !res.ok || !res.result) {
    return false;
  }

  const status = res.result.status;
  return ["creator", "administrator", "member", "restricted"].includes(status);
}

async function sendForceJoinPrompt(env, chatId, lang = "en") {
  const forceChannel = (env.FORCE_CHANNEL || "@ZenoxUpdates").trim();
  const cleanChannel = forceChannel.startsWith("@")
    ? forceChannel.slice(1)
    : forceChannel;
  const channelUrl = forceChannel.startsWith("http")
    ? forceChannel
    : `https://t.me/${cleanChannel}`;

  const dict = I18N[lang] || I18N.en;
  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text: dict.force_join(forceChannel),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: `📢 Join ${forceChannel}`, url: channelUrl }],
        [{ text: "✅ Verify Membership", callback_data: "verify_join" }],
      ],
    },
  });
}

/**
 * Process referral reward once referee passes Force Channel Join verification
 */
async function processReferralRewardIfEligible(db, env, user, cfg) {
  if (!user.referred_by || user.ref_rewarded) return false;

  const referrerId = String(user.referred_by);
  if (referrerId === String(user.id)) return false;

  const referrerKey = `user:${referrerId}:data`;
  const referrer = await getJson(db, referrerKey, null);
  if (!referrer) return false;

  const bonus = Number(cfg.REF_BONUS_INR) || DEFAULT_CONFIG.REF_BONUS_INR;

  user.ref_rewarded = true;
  await saveUserData(db, user.id, user);

  referrer.balance = (Number(referrer.balance) || 0) + bonus;
  referrer.total_earned = (Number(referrer.total_earned) || 0) + bonus;
  referrer.referral_count = (Number(referrer.referral_count) || 0) + 1;
  referrer.referral_earnings = (Number(referrer.referral_earnings) || 0) + bonus;
  await saveUserData(db, referrerId, referrer);

  if (referrer.notifications !== false) {
    const fmt = (val) => formatCurrency(val, referrer.currency, cfg.USDT_RATE_INR);
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: referrerId,
      text:
        `🎉 <b>New Referral Verified!</b>\n\n` +
        `User <b>${escapeHtml(user.first_name)}</b> joined and verified membership via your referral link.\n` +
        `💰 <b>+${fmt(bonus)}</b> has been credited to your wallet!\n` +
        `💼 <b>Updated Balance:</b> ${fmt(referrer.balance)}`,
      parse_mode: "HTML",
    });
  }
  return true;
}

/**
 * Build Inline Settings Keyboard
 */
function buildSettingsInlineKeyboard(user) {
  const langLabel =
    user.lang === "hi" ? "🗣 Language: Hindi (हिंदी) 🔄" : "🗣 Language: English 🔄";
  const notifLabel =
    user.notifications !== false
      ? "🔔 Notifications: ON 🔄"
      : "🔕 Notifications: OFF 🔄";
  const currLabel =
    user.currency === "USDT"
      ? "💱 Currency: USDT ($) 🔄"
      : "💱 Currency: INR (₹) 🔄";

  return {
    inline_keyboard: [
      [{ text: langLabel, callback_data: "toggle_lang" }],
      [{ text: notifLabel, callback_data: "toggle_notif" }],
      [{ text: currLabel, callback_data: "toggle_currency" }],
    ],
  };
}

/**
 * Build Dynamic Rates & Financial Rules Inline Keyboard for Admins
 */
function buildRatesInlineKeyboard(cfg) {
  return {
    inline_keyboard: [
      [
        {
          text: `🛒 Buy Gmail: ₹${cfg.BUY_GMAIL_INR} ✏️`,
          callback_data: "set_rate:BUY_GMAIL_INR",
        },
        {
          text: `📥 Sell Gmail: ₹${cfg.SELL_GMAIL_INR} ✏️`,
          callback_data: "set_rate:SELL_GMAIL_INR",
        },
      ],
      [
        {
          text: `📘 Buy FB: ₹${cfg.BUY_FB_INR} ✏️`,
          callback_data: "set_rate:BUY_FB_INR",
        },
        {
          text: `📤 Sell FB: ₹${cfg.SELL_FB_INR} ✏️`,
          callback_data: "set_rate:SELL_FB_INR",
        },
      ],
      [
        {
          text: `🏦 Min Withdraw: ₹${cfg.MIN_WITHDRAW_INR} ✏️`,
          callback_data: "set_rate:MIN_WITHDRAW_INR",
        },
        {
          text: `👥 Referral Bonus: ₹${cfg.REF_BONUS_INR} ✏️`,
          callback_data: "set_rate:REF_BONUS_INR",
        },
      ],
      [
        {
          text: `💱 1 USDT Rate: ₹${cfg.USDT_RATE_INR} ✏️`,
          callback_data: "set_rate:USDT_RATE_INR",
        },
      ],
    ],
  };
}

/**
 * Send Main Menu
 */
async function sendMainMenu(db, env, chatId, user, isAdmin, cfg, customText = null) {
  const dict = I18N[user.lang] || I18N.en;
  const text = customText || dict.welcome(user.first_name, cfg);
  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: buildMainKeyboard(env, isAdmin),
  });
}

/**
 * Main Incoming Message Handler
 */
async function handleMessage(message, env) {
  const db = env.DB;
  const chatId = message.chat?.id;
  if (!chatId) return;

  const text = (message.text || message.caption || "").trim();
  const user = await getUserData(db, chatId, message.from || {});
  const isAdmin = await isAdminUser(db, env, chatId);
  const cfg = await getSystemConfig(db);
  const fmt = (val) => formatCurrency(val, user.currency, cfg.USDT_RATE_INR);
  const dict = I18N[user.lang] || I18N.en;

  // Check if user is banned
  if (user.banned && !isAdmin) {
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `🚫 <b>Account Suspended</b>\n\nYour account has been restricted by an administrator. Contact ${escapeHtml(env.SUPPORT_USERNAME || "@ZenoxWorker")} for assistance.`,
      parse_mode: "HTML",
    });
    return;
  }

  // Capture referral parameter on /start <ref_id> BEFORE force-join block
  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/);
    if (parts.length > 1) {
      const refCandidate = parts[1].replace(/^ref_/, "").trim();
      if (
        refCandidate &&
        refCandidate !== String(chatId) &&
        !user.referred_by &&
        !user.ref_rewarded
      ) {
        user.referred_by = refCandidate;
        await saveUserData(db, chatId, user);
      }
    }
  }

  // 1. Force Channel Join Check (Blocks all actions until verified)
  const isMember = await checkForceChannelMembership(env, chatId);
  if (!isMember) {
    await sendForceJoinPrompt(env, chatId, user.lang);
    return;
  }

  // Award referral bonus if newly verified
  await processReferralRewardIfEligible(db, env, user, cfg);

  // 2. Maintenance Mode Check (Regular users blocked, Admins bypass)
  const maintenance = await getJson(db, "system:maintenance", false);
  if (maintenance && !isAdmin) {
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: dict.maintenance_active(env.SUPPORT_USERNAME || "@ZenoxWorker"),
      parse_mode: "HTML",
    });
    return;
  }

  // 3. Global Cancel Button / Command
  if (text === BUTTONS.CANCEL || text === "/cancel") {
    await setUserState(db, chatId, "IDLE");
    await sendMainMenu(db, env, chatId, user, isAdmin, cfg, dict.cancelled);
    return;
  }

  // 4. Handle /start command
  if (text.startsWith("/start")) {
    await setUserState(db, chatId, "IDLE");
    await sendMainMenu(db, env, chatId, user, isAdmin, cfg);
    return;
  }

  // 5. Handle /admin or ⚡ Admin Dashboard button
  if (text === BUTTONS.ADMIN || text === "/admin") {
    if (!isAdmin) {
      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: "⛔ <b>Access Denied:</b> You are not authorized to access the Admin Dashboard.",
        parse_mode: "HTML",
      });
      return;
    }
    await setUserState(db, chatId, "IDLE");
    await sendAdminDashboardSummary(db, env, chatId, cfg);
    return;
  }

  if (text === ADMIN_BUTTONS.BACK_HOME && isAdmin) {
    await setUserState(db, chatId, "IDLE");
    await sendMainMenu(db, env, chatId, user, isAdmin, cfg, "🏠 Returned to User Navigation.");
    return;
  }

  // 6. Check if User/Admin is in an active multi-step state
  const state = await getUserState(db, chatId);
  if (state && state.action !== "IDLE") {
    const isMenuOverride =
      [
        BUTTONS.BUY_GMAIL,
        BUTTONS.SELL_GMAIL,
        BUTTONS.BUY_FB,
        BUTTONS.SELL_FB,
        BUTTONS.WALLET,
        BUTTONS.ORDERS,
        BUTTONS.REFER,
        BUTTONS.SETTINGS,
        BUTTONS.UPDATES,
        ADMIN_BUTTONS.ADD_GMAIL_STOCK,
        ADMIN_BUTTONS.ADD_FB_STOCK,
        ADMIN_BUTTONS.STATS,
        ADMIN_BUTTONS.USER_LIST,
        ADMIN_BUTTONS.INSPECT_USER,
        ADMIN_BUTTONS.RATES_CONFIG,
        ADMIN_BUTTONS.PENDING_BUYS,
        ADMIN_BUTTONS.PENDING_SELLS,
        ADMIN_BUTTONS.PAYOUTS,
        ADMIN_BUTTONS.ADMINS,
        ADMIN_BUTTONS.BROADCAST,
        ADMIN_BUTTONS.MAINTENANCE,
      ].includes(text) || text.startsWith(BUTTONS.SUPPORT_PREFIX);

    if (isMenuOverride) {
      await setUserState(db, chatId, "IDLE");
    } else {
      await handleStatefulInput(message, text, state, user, isAdmin, cfg, env);
      return;
    }
  }

  // 7. Standard Bottom Keyboard Navigation Routing (Gmail & Facebook Buy/Sell)
  if (text === BUTTONS.BUY_GMAIL || text.startsWith("🛒 Buy Gmail")) {
    await initiateBuyWorkflow(db, env, chatId, user, isAdmin, cfg, "GMAIL");
    return;
  }

  if (text === BUTTONS.BUY_FB || text.startsWith("📘 Buy Facebook")) {
    await initiateBuyWorkflow(db, env, chatId, user, isAdmin, cfg, "FACEBOOK");
    return;
  }

  if (text === BUTTONS.SELL_GMAIL || text.startsWith("📥 Sell Gmail")) {
    await initiateSellWorkflow(db, env, chatId, cfg, "GMAIL");
    return;
  }

  if (text === BUTTONS.SELL_FB || text.startsWith("📤 Sell Facebook")) {
    await initiateSellWorkflow(db, env, chatId, cfg, "FACEBOOK");
    return;
  }

  if (text === BUTTONS.WALLET) {
    const minWithdraw = Number(cfg.MIN_WITHDRAW_INR) || 100;
    const canWithdraw = (Number(user.balance) || 0) >= minWithdraw;
    const inlineRows = [
      [
        {
          text: canWithdraw
            ? `💸 Withdraw Funds (Min ₹${minWithdraw})`
            : `🔒 Withdraw Locked (Min ₹${minWithdraw} Required)`,
          callback_data: "initiate_withdraw",
        },
      ],
      [{ text: "📜 Withdrawal History", callback_data: "withdraw_history" }],
    ];

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `💼 <b>My Wallet & Payouts</b>\n\n` +
        `👤 <b>Account ID:</b> <code>${chatId}</code>\n` +
        `💰 <b>Available Balance:</b> <b>${fmt(user.balance)}</b>\n` +
        `📈 <b>Total Lifetime Earned:</b> ${fmt(user.total_earned || 0)}\n` +
        `🏦 <b>Total Withdrawn:</b> ${fmt(user.total_withdrawn || 0)}\n` +
        `👥 <b>Referral Earnings:</b> ${fmt(user.referral_earnings || 0)} (${user.referral_count || 0} refs)\n\n` +
        `ℹ️ <b>Withdrawal Rule:</b> Minimum withdrawal limit is strictly <b>${fmt(minWithdraw)}</b>. Supported payout modes: UPI & USDT (TRC20/BEP20).`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineRows },
    });
    return;
  }

  if (text === BUTTONS.ORDERS) {
    await sendUserOrdersOverview(db, env, chatId, user, cfg);
    return;
  }

  if (text === BUTTONS.REFER || text.startsWith("👥 Refer & Earn")) {
    const botInfo = await callApi(env.BOT_TOKEN, "getMe", {});
    const botUsername = botInfo?.result?.username || "ZenoxGmailBot";
    const refLink = `https://t.me/${botUsername}?start=${chatId}`;

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `👥 <b>Refer & Earn Program</b>\n\n` +
        `Invite friends to Zenox Mail & Social Master Pro and earn <b>${fmt(cfg.REF_BONUS_INR)}</b> instantly as soon as they join and verify membership in our channel!\n\n` +
        `🔗 <b>Your Unique Referral Link:</b>\n<code>${refLink}</code>\n\n` +
        `📊 <b>Your Referral Statistics:</b>\n` +
        `• <b>Verified Referrals:</b> <code>${user.referral_count || 0}</code> users\n` +
        `• <b>Total Bonus Earned:</b> <b>${fmt(user.referral_earnings || 0)}</b>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📤 Share Referral Link",
              url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Join Zenox Mail & Social Master Pro to buy & sell Gmail and Facebook accounts with instant payouts!")}`,
            },
          ],
        ],
      },
    });
    return;
  }

  if (text === BUTTONS.SETTINGS) {
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: dict.settings_title(user, fmt, cfg),
      parse_mode: "HTML",
      reply_markup: buildSettingsInlineKeyboard(user),
    });
    return;
  }

  if (text === BUTTONS.UPDATES) {
    const forceChannel = env.FORCE_CHANNEL || "@ZenoxUpdates";
    const cleanChannel = forceChannel.startsWith("@")
      ? forceChannel.slice(1)
      : forceChannel;
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `📢 <b>Official Updates & Stock Alerts</b>\n\n` +
        `Stay tuned to <b>${escapeHtml(forceChannel)}</b> for daily Gmail & Facebook stock restocks, payout proofs, and rate announcements.`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: `📢 Open ${forceChannel}`, url: `https://t.me/${cleanChannel}` }],
        ],
      },
    });
    return;
  }

  if (text.startsWith(BUTTONS.SUPPORT_PREFIX)) {
    const support = env.SUPPORT_USERNAME || "@ZenoxWorker";
    const cleanSupport = support.startsWith("@") ? support.slice(1) : support;
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `💬 <b>24/7 Customer & Order Support</b>\n\n` +
        `Need assistance with bulk Gmail/Facebook orders, UPI payment verification, or wallet payouts?\n` +
        `Contact our official support desk: <b>${escapeHtml(support)}</b>\n\n` +
        `🆔 <b>Your Support Reference ID:</b> <code>${chatId}</code>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: `💬 Message ${support}`, url: `https://t.me/${cleanSupport}` }],
        ],
      },
    });
    return;
  }

  // 8. Admin Dashboard Buttons Routing
  if (isAdmin) {
    const handledAdmin = await handleAdminMenuAction(text, db, env, chatId, cfg);
    if (handledAdmin) return;
  }

  await sendMainMenu(db, env, chatId, user, isAdmin, cfg);
}

/**
 * Initiate Buy Workflow for Gmail or Facebook
 */
async function initiateBuyWorkflow(db, env, chatId, user, isAdmin, cfg, platform) {
  const isFb = platform === "FACEBOOK";
  const stockKey = isFb ? "stock:facebook" : "stock:gmails";
  const unitPrice = isFb ? cfg.BUY_FB_INR : cfg.BUY_GMAIL_INR;
  const label = isFb ? "Facebook" : "Gmail";
  const icon = isFb ? "📘" : "🛒";
  const fmt = (val) => formatCurrency(val, user.currency, cfg.USDT_RATE_INR);

  const stock = await getJson(db, stockKey, []);
  if (stock.length === 0) {
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `📦 <b>${label} Accounts Out of Stock</b>\n\n` +
        `All verified ${label} accounts are currently sold out. Please check our updates channel or try again shortly!`,
      parse_mode: "HTML",
      reply_markup: buildMainKeyboard(env, isAdmin),
    });
    return;
  }

  await setUserState(db, chatId, "BUY_AWAIT_QTY", { platform });
  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text:
      `${icon} <b>Buy Verified ${label} Accounts</b>\n\n` +
      `• <b>Rate per Account:</b> <b>${fmt(unitPrice)}</b>\n` +
      `• <b>Available Stock:</b> <code>${stock.length}</code> accounts\n` +
      `• <b>Delivery Format:</b> Direct Email/UID & Password (No colon clutter)\n` +
      `• <b>Security & Recovery Notice:</b> Every delivered account includes an explicit recovery mail status & security binding guide.\n\n` +
      `🔢 <b>Enter the quantity of ${label} accounts you want to buy (1 - ${stock.length}):</b>`,
    parse_mode: "HTML",
    reply_markup: buildCancelKeyboard(),
  });
}

/**
 * Initiate Sell Workflow for Gmail or Facebook (Clean Colon-Free Format + Recovery Notice)
 */
async function initiateSellWorkflow(db, env, chatId, cfg, platform) {
  const isFb = platform === "FACEBOOK";
  const unitPayout = isFb ? cfg.SELL_FB_INR : cfg.SELL_GMAIL_INR;
  const label = isFb ? "Facebook" : "Gmail";
  const icon = isFb ? "📤" : "📥";
  const exampleLine = isFb
    ? "10008927364512 Pass@9921"
    : "alexsmith99@gmail.com Pass@1234";

  await setUserState(db, chatId, "SELL_AWAIT_ACCOUNTS", { platform });
  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text:
      `${icon} <b>Sell Your ${label} Accounts</b>\n\n` +
      `• <b>Payout Rate:</b> <b>₹${unitPayout}</b> per verified account\n` +
      `• <b>Clean Format (No Colons Needed):</b> Send your account & password separated by a simple space:\n` +
      `  <code>${exampleLine}</code>\n\n` +
      `🛡 <b>Important Recovery Mail Notice:</b>\n` +
      `• Please submit fresh accounts with <b>NO recovery email attached</b> and 2FA turned off.\n` +
      `• If an account already has a recovery email attached, include it after a space (<code>email password recovery@mail.com</code>) so our security team can verify it.\n\n` +
      `📝 <b>Send 1 account or paste multiple accounts (one per line) below:</b>`,
    parse_mode: "HTML",
    reply_markup: buildCancelKeyboard(),
  });
}

/**
 * Send User Orders & Sells History
 */
async function sendUserOrdersOverview(db, env, chatId, user, cfg) {
  const fmt = (val) => formatCurrency(val, user.currency, cfg.USDT_RATE_INR);
  const recentOrders = (user.orders || []).slice(-6).reverse();
  const recentSells = (user.sells || []).slice(-6).reverse();

  let orderLines = "";
  if (recentOrders.length === 0) {
    orderLines = "<i>No buy orders placed yet.</i>\n";
  } else {
    for (const ordId of recentOrders) {
      const ord = await getJson(db, `orders:${ordId}`, null);
      if (ord) {
        const badge =
          ord.status === "APPROVED"
            ? "✅ Approved"
            : ord.status === "REJECTED"
            ? "❌ Rejected"
            : "⏳ Pending";
        const pLabel = ord.platform === "FACEBOOK" ? "FB" : "Gmail";
        orderLines += `• <code>${ord.id}</code> — ${ord.quantity}x ${pLabel} (${fmt(ord.total_inr)}) — <b>${badge}</b>\n`;
      }
    }
  }

  let sellLines = "";
  if (recentSells.length === 0) {
    sellLines = "<i>No account sell submissions yet.</i>\n";
  } else {
    for (const sellId of recentSells) {
      const sell = await getJson(db, `sells:${sellId}`, null);
      if (sell) {
        const badge =
          sell.status === "APPROVED"
            ? "✅ Approved"
            : sell.status === "REJECTED"
            ? "❌ Rejected"
            : "⏳ Pending";
        const pLabel = sell.platform === "FACEBOOK" ? "FB" : "Gmail";
        sellLines += `• <code>${sell.id}</code> — ${sell.accounts.length}x ${pLabel} (${fmt(sell.payout_inr)}) — <b>${badge}</b>\n`;
      }
    }
  }

  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text:
      `📦 <b>My Orders & Submissions</b>\n\n` +
      `🛒 <b>Recent Buy Orders:</b>\n${orderLines}\n` +
      `📥 <b>Recent Sell Submissions:</b>\n${sellLines}`,
    parse_mode: "HTML",
  });
}

/**
 * Handle Stateful Input for Buy, Sell, Withdrawal, and Admin Workflows
 */
async function handleStatefulInput(message, text, state, user, isAdmin, cfg, env) {
  const db = env.DB;
  const chatId = message.chat.id;
  const fmt = (val) => formatCurrency(val, user.currency, cfg.USDT_RATE_INR);

  switch (state.action) {
    // --- BUY WORKFLOW (GMAIL & FACEBOOK) ---
    case "BUY_AWAIT_QTY": {
      const platform = state.meta?.platform || "GMAIL";
      const isFb = platform === "FACEBOOK";
      const stockKey = isFb ? "stock:facebook" : "stock:gmails";
      const unitPrice = isFb ? cfg.BUY_FB_INR : cfg.BUY_GMAIL_INR;
      const label = isFb ? "Facebook" : "Gmail";

      const qty = parseInt(text, 10);
      const stock = await getJson(db, stockKey, []);
      if (isNaN(qty) || qty <= 0) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Please enter a valid positive number for quantity (e.g., <code>1</code>, <code>5</code>).",
          parse_mode: "HTML",
        });
        return;
      }
      if (qty > stock.length) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `⚠️ Only <code>${stock.length}</code> ${label} accounts are currently in stock. Please enter a quantity up to ${stock.length}:`,
          parse_mode: "HTML",
        });
        return;
      }

      const totalInr = qty * unitPrice;
      const orderId = generateId(isFb ? "FBUY" : "GBUY");
      const upiDetails = env.UPI_DETAILS || "zenoxexchange@upi (Scan QR or Pay directly)";

      await setUserState(db, chatId, "BUY_AWAIT_PROOF", {
        orderId,
        platform,
        quantity: qty,
        totalInr,
      });

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `🧾 <b>Order Invoice Generated (${label})</b>\n\n` +
          `• <b>Order ID:</b> <code>${orderId}</code>\n` +
          `• <b>Service:</b> ${label} Accounts\n` +
          `• <b>Quantity:</b> <code>${qty}</code> Account(s)\n` +
          `• <b>Unit Price:</b> ₹${unitPrice} / account\n` +
          `• <b>Total Payable:</b> <b>${fmt(totalInr)}</b>\n\n` +
          `🏦 <b>Payment Details (UPI / QR):</b>\n` +
          `<code>${escapeHtml(upiDetails)}</code>\n\n` +
          `📸 <b>Next Step:</b> Complete the payment of <b>₹${totalInr}</b> and send your <b>12-digit UTR / Reference Number</b> or upload a <b>Payment Screenshot</b> right here:`,
        parse_mode: "HTML",
        reply_markup: buildCancelKeyboard(),
      });
      return;
    }

    case "BUY_AWAIT_PROOF": {
      const { orderId, platform = "GMAIL", quantity, totalInr } = state.meta;
      const label = platform === "FACEBOOK" ? "Facebook" : "Gmail";
      const photoFileId =
        message.photo && message.photo.length > 0
          ? message.photo[message.photo.length - 1].file_id
          : null;
      const proofText = text || (photoFileId ? "Screenshot Uploaded" : "");

      if (!proofText && !photoFileId) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Please send a valid UTR / Transaction ID text or upload a payment screenshot.",
          parse_mode: "HTML",
        });
        return;
      }

      const orderRecord = {
        id: orderId,
        platform,
        buyer_id: String(chatId),
        buyer_name: user.first_name,
        buyer_username: user.username,
        quantity,
        total_inr: totalInr,
        proof_text: proofText,
        proof_photo: photoFileId,
        status: "PENDING",
        created_at: new Date().toISOString(),
      };

      await putJson(db, `orders:${orderId}`, orderRecord);

      const pendingBuys = await getJson(db, "PENDING_BUY_QUEUE", []);
      pendingBuys.push(orderId);
      await putJson(db, "PENDING_BUY_QUEUE", pendingBuys);

      user.orders = user.orders || [];
      user.orders.push(orderId);
      await saveUserData(db, chatId, user);
      await setUserState(db, chatId, "IDLE");

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `✅ <b>Payment Proof Submitted!</b>\n\n` +
          `• <b>Order ID:</b> <code>${orderId}</code>\n` +
          `• <b>Service:</b> ${quantity}x ${label} Account(s)\n` +
          `• <b>Amount Paid:</b> ${fmt(totalInr)}\n` +
          `• <b>Status:</b> ⏳ Pending Admin Verification\n\n` +
          `Your ${label} credentials and security recovery notices will be delivered automatically via DM as soon as an admin approves your payment.`,
        parse_mode: "HTML",
        reply_markup: buildMainKeyboard(env, isAdmin),
      });

      const adminAlertText =
        `🚨 <b>New ${label} Buy Order!</b>\n\n` +
        `• <b>Order ID:</b> <code>${orderId}</code>\n` +
        `• <b>Service:</b> ${label}\n` +
        `• <b>Buyer:</b> ${escapeHtml(user.first_name)} (${user.username ? `@${escapeHtml(user.username)}` : `<code>${chatId}</code>`})\n` +
        `• <b>Quantity:</b> <code>${quantity}</code> accounts\n` +
        `• <b>Total Amount:</b> <b>₹${totalInr}</b>\n` +
        `• <b>Payment Proof:</b> <code>${escapeHtml(proofText)}</code>`;

      const adminKeyboard = {
        inline_keyboard: [
          [
            {
              text: `✅ Approve Order #${orderId}`,
              callback_data: `approve_buy:${orderId}`,
            },
          ],
          [
            {
              text: `❌ Reject Order #${orderId}`,
              callback_data: `reject_buy:${orderId}`,
            },
          ],
        ],
      };

      const adminIds = await getAllAdminIds(db, env);
      for (const adminId of adminIds) {
        if (photoFileId) {
          await callApi(env.BOT_TOKEN, "sendPhoto", {
            chat_id: adminId,
            photo: photoFileId,
            caption: adminAlertText,
            parse_mode: "HTML",
            reply_markup: adminKeyboard,
          });
        } else {
          await callApi(env.BOT_TOKEN, "sendMessage", {
            chat_id: adminId,
            text: adminAlertText,
            parse_mode: "HTML",
            reply_markup: adminKeyboard,
          });
        }
      }
      return;
    }

    // --- SELL WORKFLOW (COLON-FREE FORMAT + RECOVERY NOTICE) ---
    case "SELL_AWAIT_ACCOUNTS": {
      const platform = state.meta?.platform || "GMAIL";
      const isFb = platform === "FACEBOOK";
      const label = isFb ? "Facebook" : "Gmail";
      const unitPayout = isFb ? cfg.SELL_FB_INR : cfg.SELL_GMAIL_INR;

      const { validAccounts, invalidLines } = parseSubmittedAccountLines(text);

      if (validAccounts.length === 0) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text:
            `❌ <b>Could Not Parse Account Credentials!</b>\n\n` +
            `Please send your ${label} account and password separated by a clean space (no colons required):\n` +
            `<code>${isFb ? "10008927364512 Pass@9921" : "alexsmith99@gmail.com Pass@1234"}</code>\n\n` +
            `🛡 <b>Recovery Notice:</b> If a recovery email is attached, add it after a space at the end of the line. Try again or tap Cancel:`,
          parse_mode: "HTML",
        });
        return;
      }

      const sellId = generateId(isFb ? "FSELL" : "GSELL");
      const totalPayoutInr = validAccounts.length * unitPayout;
      const sellRecord = {
        id: sellId,
        platform,
        seller_id: String(chatId),
        seller_name: user.first_name,
        seller_username: user.username,
        accounts: validAccounts,
        payout_inr: totalPayoutInr,
        status: "PENDING",
        created_at: new Date().toISOString(),
      };

      await putJson(db, `sells:${sellId}`, sellRecord);

      const queue = await getJson(db, "PENDING_SELL_QUEUE", []);
      queue.push(sellId);
      await putJson(db, "PENDING_SELL_QUEUE", queue);

      user.sells = user.sells || [];
      user.sells.push(sellId);
      await saveUserData(db, chatId, user);
      await setUserState(db, chatId, "IDLE");

      const noRecoveryCount = validAccounts.filter((a) => !a.recovery).length;
      const withRecoveryCount = validAccounts.length - noRecoveryCount;

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `📥 <b>${label} Accounts Queued for Verification!</b>\n\n` +
          `• <b>Submission ID:</b> <code>${sellId}</code>\n` +
          `• <b>Service:</b> ${label}\n` +
          `• <b>Valid Accounts Accepted:</b> <code>${validAccounts.length}</code>\n` +
          `• <b>Recovery Mail Check:</b> ${noRecoveryCount} fresh (no recovery) · ${withRecoveryCount} with recovery mail\n` +
          (invalidLines.length > 0
            ? `• <b>Skipped Unrecognized Lines:</b> <code>${invalidLines.length}</code>\n`
            : "") +
          `• <b>Expected Payout:</b> <b>${fmt(totalPayoutInr)}</b> (₹${unitPayout}/acc)\n\n` +
          `⏳ Once an admin verifies your credentials, <b>₹${totalPayoutInr}</b> will be credited automatically to your wallet.`,
        parse_mode: "HTML",
        reply_markup: buildMainKeyboard(env, isAdmin),
      });

      const accountsPreview = validAccounts
        .map((acc, idx) => formatCredentialCard(acc, idx, platform))
        .join("\n\n");

      await notifyAdmins(
        db,
        env,
        `📥 <b>New Sell ${label} Submission!</b>\n\n` +
          `• <b>Submission ID:</b> <code>${sellId}</code>\n` +
          `• <b>Seller:</b> ${escapeHtml(user.first_name)} (<code>${chatId}</code>)\n` +
          `• <b>Quantity:</b> <code>${validAccounts.length}</code> ${label} account(s)\n` +
          `• <b>Wallet Credit on Approval:</b> <b>₹${totalPayoutInr}</b>\n\n` +
          `🔐 <b>Submitted Credentials & Recovery Check:</b>\n\n${accountsPreview}`,
        {
          inline_keyboard: [
            [
              {
                text: `✅ Approve & Credit ₹${totalPayoutInr}`,
                callback_data: `approve_sell:${sellId}`,
              },
            ],
            [
              {
                text: `❌ Reject Submission`,
                callback_data: `reject_sell:${sellId}`,
              },
            ],
          ],
        }
      );
      return;
    }

    // --- WALLET & WITHDRAWAL WORKFLOW (STRICT ₹100 MINIMUM) ---
    case "WITHDRAW_AWAIT_AMOUNT": {
      const minWithdraw = Number(cfg.MIN_WITHDRAW_INR) || 100;
      const amountInr = parseFloat(text);
      if (isNaN(amountInr) || amountInr < minWithdraw) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `⚠️ <b>Minimum withdrawal limit is strictly ₹${minWithdraw}.</b>\nPlease enter an amount of ₹${minWithdraw} or higher:`,
          parse_mode: "HTML",
        });
        return;
      }

      if (amountInr > (Number(user.balance) || 0)) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `⚠️ Insufficient wallet balance. Your available balance is <b>${fmt(user.balance)}</b>.`,
          parse_mode: "HTML",
        });
        return;
      }

      await setUserState(db, chatId, "WITHDRAW_AWAIT_DETAILS", {
        amountInr: Math.floor(amountInr),
      });

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `🏦 <b>Enter Payout Destination Details</b>\n\n` +
          `• <b>Withdrawal Amount:</b> <b>${fmt(Math.floor(amountInr))}</b>\n\n` +
          `Please send your <b>UPI ID</b> (e.g. <code>name@ybl</code>) OR your <b>USDT TRC20/BEP20 Wallet Address</b>:`,
        parse_mode: "HTML",
        reply_markup: buildCancelKeyboard(),
      });
      return;
    }

    case "WITHDRAW_AWAIT_DETAILS": {
      const { amountInr } = state.meta;
      if (text.length < 4) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Please enter a valid UPI ID or USDT wallet address.",
          parse_mode: "HTML",
        });
        return;
      }

      if ((Number(user.balance) || 0) < amountInr) {
        await setUserState(db, chatId, "IDLE");
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "❌ Insufficient balance for this withdrawal.",
          parse_mode: "HTML",
          reply_markup: buildMainKeyboard(env, isAdmin),
        });
        return;
      }

      user.balance = Number(user.balance) - amountInr;
      const payoutId = generateId("PAY");

      const payoutRecord = {
        id: payoutId,
        user_id: String(chatId),
        user_name: user.first_name,
        user_username: user.username,
        amount_inr: amountInr,
        amount_usdt: (amountInr / (Number(cfg.USDT_RATE_INR) || 90)).toFixed(2),
        details: text,
        status: "PENDING",
        created_at: new Date().toISOString(),
      };

      await putJson(db, `payouts:${payoutId}`, payoutRecord);

      const pendingPayouts = await getJson(db, "payouts:pending_list", []);
      pendingPayouts.push(payoutId);
      await putJson(db, "payouts:pending_list", pendingPayouts);

      user.payouts = user.payouts || [];
      user.payouts.push(payoutId);
      await saveUserData(db, chatId, user);
      await setUserState(db, chatId, "IDLE");

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `✅ <b>Withdrawal Request Submitted!</b>\n\n` +
          `• <b>Payout ID:</b> <code>${payoutId}</code>\n` +
          `• <b>Amount:</b> <b>${fmt(amountInr)}</b>\n` +
          `• <b>Payout Destination:</b> <code>${escapeHtml(text)}</code>\n` +
          `• <b>Remaining Wallet Balance:</b> ${fmt(user.balance)}\n\n` +
          `⏳ Your request has been routed to the Admin team for settlement.`,
        parse_mode: "HTML",
        reply_markup: buildMainKeyboard(env, isAdmin),
      });

      await notifyAdmins(
        db,
        env,
        `💳 <b>New Withdrawal Request!</b>\n\n` +
          `• <b>Payout ID:</b> <code>${payoutId}</code>\n` +
          `• <b>User:</b> ${escapeHtml(user.first_name)} (<code>${chatId}</code>)\n` +
          `• <b>Amount:</b> <b>₹${amountInr}</b> (~$${payoutRecord.amount_usdt} USDT)\n` +
          `• <b>Payout Details:</b> <code>${escapeHtml(text)}</code>`,
        {
          inline_keyboard: [
            [
              {
                text: "✅ Mark Paid",
                callback_data: `payout_paid:${payoutId}`,
              },
              {
                text: "❌ Reject Refund",
                callback_data: `payout_reject:${payoutId}`,
              },
            ],
          ],
        }
      );
      return;
    }

    // --- ADMIN WORKFLOWS ---
    case "ADMIN_ADD_STOCK": {
      if (!isAdmin) return;
      const platform = state.meta?.platform || "GMAIL";
      const isFb = platform === "FACEBOOK";
      const stockKey = isFb ? "stock:facebook" : "stock:gmails";
      const label = isFb ? "Facebook" : "Gmail";

      const { validAccounts } = parseSubmittedAccountLines(text);
      if (validAccounts.length === 0) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `❌ No valid ${label} accounts detected. Send lines formatted as <code>email password</code> (or <code>uid password recovery</code>):`,
          parse_mode: "HTML",
        });
        return;
      }

      const stock = await getJson(db, stockKey, []);
      stock.push(...validAccounts);
      await putJson(db, stockKey, stock);
      await setUserState(db, chatId, "IDLE");

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `✅ <b>${label} Stock Added Successfully!</b>\n\n` +
          `• <b>Newly Added:</b> <code>${validAccounts.length}</code> accounts\n` +
          `• <b>Total Active ${label} Stock:</b> <code>${stock.length}</code> accounts`,
        parse_mode: "HTML",
        reply_markup: buildAdminKeyboard(),
      });
      return;
    }

    case "ADMIN_INSPECT_USER_PROMPT": {
      if (!isAdmin) return;
      const targetId = text.replace(/[^0-9]/g, "");
      if (!targetId) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Please enter a valid numeric Telegram User ID to inspect.",
          parse_mode: "HTML",
        });
        return;
      }
      await setUserState(db, chatId, "IDLE");
      await sendAdminUserInspectionCard(db, env, chatId, targetId, cfg);
      return;
    }

    case "ADMIN_ADJUST_USER_BALANCE": {
      if (!isAdmin) return;
      const { targetUserId, mode } = state.meta;
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Please enter a valid positive numeric amount in INR.",
          parse_mode: "HTML",
        });
        return;
      }

      const targetUser = await getJson(db, `user:${targetUserId}:data`, null);
      await setUserState(db, chatId, "IDLE");
      if (!targetUser) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `❌ User <code>${targetUserId}</code> not found.`,
          parse_mode: "HTML",
          reply_markup: buildAdminKeyboard(),
        });
        return;
      }

      if (mode === "ADD") {
        targetUser.balance = (Number(targetUser.balance) || 0) + amount;
        targetUser.total_earned = (Number(targetUser.total_earned) || 0) + amount;
      } else {
        targetUser.balance = Math.max(0, (Number(targetUser.balance) || 0) - amount);
      }
      await saveUserData(db, targetUserId, targetUser);

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: targetUserId,
        text:
          mode === "ADD"
            ? `💰 <b>Wallet Credited by Admin</b>\n\n<b>+₹${amount}</b> has been added to your wallet.\n💼 <b>New Balance:</b> ₹${targetUser.balance}`
            : `💸 <b>Wallet Adjusted by Admin</b>\n\n<b>-₹${amount}</b> was deducted from your wallet.\n💼 <b>New Balance:</b> ₹${targetUser.balance}`,
        parse_mode: "HTML",
      });

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: `✅ Updated wallet for user <code>${targetUserId}</code>. New Balance: <b>₹${targetUser.balance}</b>.`,
        parse_mode: "HTML",
        reply_markup: buildAdminKeyboard(),
      });
      await sendAdminUserInspectionCard(db, env, chatId, targetUserId, cfg);
      return;
    }

    case "ADMIN_SET_RATE_VALUE": {
      if (!isAdmin) return;
      const { rateKey } = state.meta;
      const newVal = parseFloat(text);
      if (isNaN(newVal) || newVal <= 0) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Please enter a valid positive number.",
          parse_mode: "HTML",
        });
        return;
      }

      const updatedCfg = await saveSystemConfig(db, { [rateKey]: Math.floor(newVal) });
      await setUserState(db, chatId, "IDLE");

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `✅ <b>Configuration Updated!</b>\n\n` +
          `• <b>Setting:</b> <code>${rateKey}</code>\n` +
          `• <b>New Value:</b> <b>₹${Math.floor(newVal)}</b>`,
        parse_mode: "HTML",
        reply_markup: buildAdminKeyboard(),
      });

      await sendRatesConfigurationMenu(env, chatId, updatedCfg);
      return;
    }

    case "ADMIN_ADD_SUBADMIN": {
      if (!isAdmin) return;
      const targetId = text.replace(/[^0-9]/g, "");
      if (!targetId) {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Please send a valid numeric Telegram User ID.",
          parse_mode: "HTML",
        });
        return;
      }

      const admins = await getJson(db, "admins:list", []);
      if (!admins.includes(targetId)) {
        admins.push(targetId);
        await putJson(db, "admins:list", admins);
      }
      await setUserState(db, chatId, "IDLE");

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: `✅ User ID <code>${targetId}</code> has been granted Sub-Admin permissions.`,
        parse_mode: "HTML",
        reply_markup: buildAdminKeyboard(),
      });
      return;
    }

    case "ADMIN_BROADCAST_MSG": {
      if (!isAdmin) return;
      const usersList = await getJson(db, "users:list", []);
      await setUserState(db, chatId, "IDLE");

      let sentCount = 0;
      let skippedCount = 0;

      for (const uid of usersList) {
        const uData = await getJson(db, `user:${uid}:data`, null);
        if (uData && uData.notifications === false) {
          skippedCount++;
          continue;
        }
        const res = await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: uid,
          text: `📢 <b>Announcement</b>\n\n${text}`,
          parse_mode: "HTML",
        });
        if (res && res.ok) sentCount++;
        else skippedCount++;
      }

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `📢 <b>Broadcast Completed!</b>\n\n` +
          `• <b>Total Registered Users:</b> <code>${usersList.length}</code>\n` +
          `• <b>Delivered Successfully:</b> <code>${sentCount}</code>\n` +
          `• <b>Skipped (Notifications Off / Blocked):</b> <code>${skippedCount}</code>`,
        parse_mode: "HTML",
        reply_markup: buildAdminKeyboard(),
      });
      return;
    }

    case "ADMIN_REJECT_BUY_REASON": {
      if (!isAdmin) return;
      const { orderId } = state.meta;
      const order = await getJson(db, `orders:${orderId}`, null);
      await setUserState(db, chatId, "IDLE");

      if (!order || order.status !== "PENDING") {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `⚠️ Order <code>${orderId}</code> is already processed or not found.`,
          parse_mode: "HTML",
          reply_markup: buildAdminKeyboard(),
        });
        return;
      }

      order.status = "REJECTED";
      order.reject_reason = text;
      order.processed_by = String(chatId);
      order.processed_at = new Date().toISOString();
      await putJson(db, `orders:${orderId}`, order);

      const buyQueue = await getJson(db, "PENDING_BUY_QUEUE", []);
      await putJson(
        db,
        "PENDING_BUY_QUEUE",
        buyQueue.filter((id) => id !== orderId)
      );

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: order.buyer_id,
        text:
          `❌ <b>Buy Order Rejected</b>\n\n` +
          `• <b>Order ID:</b> <code>${order.id}</code>\n` +
          `• <b>Quantity:</b> ${order.quantity}x ${order.platform === "FACEBOOK" ? "Facebook" : "Gmail"}\n` +
          `• <b>Admin Note / Reason:</b> ${escapeHtml(text)}\n\n` +
          `If you believe this is an error, please contact ${escapeHtml(env.SUPPORT_USERNAME || "@ZenoxWorker")}.`,
        parse_mode: "HTML",
      });

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: `✅ Order <code>${orderId}</code> marked as REJECTED and buyer notified.`,
        parse_mode: "HTML",
        reply_markup: buildAdminKeyboard(),
      });
      return;
    }

    case "ADMIN_REJECT_SELL_REASON": {
      if (!isAdmin) return;
      const { sellId } = state.meta;
      const sell = await getJson(db, `sells:${sellId}`, null);
      await setUserState(db, chatId, "IDLE");

      if (!sell || sell.status !== "PENDING") {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `⚠️ Sell submission <code>${sellId}</code> is already processed or not found.`,
          parse_mode: "HTML",
          reply_markup: buildAdminKeyboard(),
        });
        return;
      }

      sell.status = "REJECTED";
      sell.reject_reason = text;
      sell.processed_by = String(chatId);
      sell.processed_at = new Date().toISOString();
      await putJson(db, `sells:${sellId}`, sell);

      const queue = await getJson(db, "PENDING_SELL_QUEUE", []);
      await putJson(
        db,
        "PENDING_SELL_QUEUE",
        queue.filter((id) => id !== sellId)
      );

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: sell.seller_id,
        text:
          `❌ <b>Sell Submission Rejected</b>\n\n` +
          `• <b>Submission ID:</b> <code>${sell.id}</code>\n` +
          `• <b>Service:</b> ${sell.platform === "FACEBOOK" ? "Facebook" : "Gmail"}\n` +
          `• <b>Accounts Submitted:</b> ${sell.accounts.length}\n` +
          `• <b>Admin Reason:</b> ${escapeHtml(text)}`,
        parse_mode: "HTML",
      });

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: `✅ Submission <code>${sellId}</code> rejected and seller notified.`,
        parse_mode: "HTML",
        reply_markup: buildAdminKeyboard(),
      });
      return;
    }

    case "ADMIN_REJECT_PAYOUT_REASON": {
      if (!isAdmin) return;
      const { payoutId } = state.meta;
      const payout = await getJson(db, `payouts:${payoutId}`, null);
      await setUserState(db, chatId, "IDLE");

      if (!payout || payout.status !== "PENDING") {
        await callApi(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `⚠️ Payout <code>${payoutId}</code> is already processed or not found.`,
          parse_mode: "HTML",
          reply_markup: buildAdminKeyboard(),
        });
        return;
      }

      payout.status = "REJECTED";
      payout.reject_reason = text;
      payout.processed_by = String(chatId);
      payout.processed_at = new Date().toISOString();
      await putJson(db, `payouts:${payoutId}`, payout);

      const pendingList = await getJson(db, "payouts:pending_list", []);
      await putJson(
        db,
        "payouts:pending_list",
        pendingList.filter((id) => id !== payoutId)
      );

      const targetUser = await getUserData(db, payout.user_id);
      targetUser.balance = (Number(targetUser.balance) || 0) + Number(payout.amount_inr);
      await saveUserData(db, payout.user_id, targetUser);

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: payout.user_id,
        text:
          `❌ <b>Withdrawal Rejected & Refunded</b>\n\n` +
          `• <b>Payout ID:</b> <code>${payout.id}</code>\n` +
          `• <b>Refunded Amount:</b> <b>₹${payout.amount_inr}</b>\n` +
          `• <b>Reason:</b> ${escapeHtml(text)}\n` +
          `• <b>Updated Wallet Balance:</b> ₹${targetUser.balance}`,
        parse_mode: "HTML",
      });

      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: `✅ Payout <code>${payoutId}</code> rejected and ₹${payout.amount_inr} refunded to user wallet.`,
        parse_mode: "HTML",
        reply_markup: buildAdminKeyboard(),
      });
      return;
    }

    default:
      await setUserState(db, chatId, "IDLE");
      await sendMainMenu(db, env, chatId, user, isAdmin, cfg);
  }
}

/**
 * Mail Master Pro Style Admin Dashboard Summary & Control Modules
 */
async function sendAdminDashboardSummary(db, env, chatId, cfg) {
  const usersList = await getJson(db, "users:list", []);
  const gmailStock = await getJson(db, "stock:gmails", []);
  const fbStock = await getJson(db, "stock:facebook", []);
  const pendingBuys = await getJson(db, "PENDING_BUY_QUEUE", []);
  const pendingSells = await getJson(db, "PENDING_SELL_QUEUE", []);
  const pendingPayouts = await getJson(db, "payouts:pending_list", []);
  const admins = await getJson(db, "admins:list", []);
  const maintenance = await getJson(db, "system:maintenance", false);

  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Mail Master Pro — Admin Control Center</b>\n\n` +
      `📊 <b>Live Inventory & Users:</b>\n` +
      `• 👥 <b>Registered Users:</b> <code>${usersList.length}</code>\n` +
      `• 📧 <b>Active Gmail Stock:</b> <code>${gmailStock.length}</code> accounts\n` +
      `• 📘 <b>Active Facebook Stock:</b> <code>${fbStock.length}</code> accounts\n\n` +
      `⏳ <b>Pending Queues:</b>\n` +
      `• 🛒 <b>Pending Buy Orders:</b> <code>${pendingBuys.length}</code>\n` +
      `• 📥 <b>Pending Sell Submissions:</b> <code>${pendingSells.length}</code>\n` +
      `• 💳 <b>Pending Withdrawals:</b> <code>${pendingPayouts.length}</code>\n\n` +
      `💰 <b>Current Rates & Limits:</b>\n` +
      `• <b>Gmail:</b> Buy ₹${cfg.BUY_GMAIL_INR} / Sell ₹${cfg.SELL_GMAIL_INR}\n` +
      `• <b>Facebook:</b> Buy ₹${cfg.BUY_FB_INR} / Sell ₹${cfg.SELL_FB_INR}\n` +
      `• <b>Min Withdrawal:</b> ₹${cfg.MIN_WITHDRAW_INR} · <b>Ref Bonus:</b> ₹${cfg.REF_BONUS_INR}\n` +
      `• <b>Sub-Admins:</b> <code>${admins.length}</code> · <b>Maintenance:</b> <b>${maintenance ? "🔴 ON" : "🟢 OFF"}</b>\n\n` +
      `Select a control module from the Admin keyboard or quick actions below:`,
    parse_mode: "HTML",
    reply_markup: buildAdminKeyboard(),
  });
}

async function sendRatesConfigurationMenu(env, chatId, cfg) {
  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text:
      `⚙️ <b>Dynamic Rates & Financial Rules Configuration</b>\n\n` +
      `• <b>Buy Gmail Rate:</b> ₹${cfg.BUY_GMAIL_INR}\n` +
      `• <b>Sell Gmail Rate:</b> ₹${cfg.SELL_GMAIL_INR}\n` +
      `• <b>Buy Facebook Rate:</b> ₹${cfg.BUY_FB_INR}\n` +
      `• <b>Sell Facebook Rate:</b> ₹${cfg.SELL_FB_INR}\n` +
      `• <b>Minimum Withdrawal Limit:</b> ₹${cfg.MIN_WITHDRAW_INR}\n` +
      `• <b>Referral Bonus:</b> ₹${cfg.REF_BONUS_INR}\n` +
      `• <b>USDT Conversion Rate:</b> 1 USDT = ₹${cfg.USDT_RATE_INR}\n\n` +
      `Tap any parameter below to update it in real time:`,
    parse_mode: "HTML",
    reply_markup: buildRatesInlineKeyboard(cfg),
  });
}

async function sendAdminUserList(db, env, chatId, page = 0) {
  const usersList = await getJson(db, "users:list", []);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(usersList.length / pageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = usersList.slice(safePage * pageSize, (safePage + 1) * pageSize);

  let lines = "";
  const inlineRows = [];

  for (const uid of slice) {
    const u = await getJson(db, `user:${uid}:data`, null);
    if (!u) continue;
    const statusTag = u.banned ? "🚫 Banned" : "🟢 Active";
    lines +=
      `• <b>${escapeHtml(u.first_name)}</b> (<code>${u.id}</code>) ${u.username ? `@${escapeHtml(u.username)}` : ""}\n` +
      `  💰 Bal: <b>₹${u.balance || 0}</b> · 🛒 Orders: ${(u.orders || []).length} · 📥 Sells: ${(u.sells || []).length} · ${statusTag}\n`;
    inlineRows.push([
      {
        text: `🔍 Inspect ${u.first_name} (#${u.id})`,
        callback_data: `inspect_user:${u.id}`,
      },
    ]);
  }

  const navRow = [];
  if (safePage > 0) {
    navRow.push({ text: "⬅️ Prev Page", callback_data: `users_page:${safePage - 1}` });
  }
  if (safePage < totalPages - 1) {
    navRow.push({ text: "Next Page ➡️", callback_data: `users_page:${safePage + 1}` });
  }
  if (navRow.length > 0) inlineRows.push(navRow);

  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text:
      `👥 <b>Registered Users Directory (Page ${safePage + 1}/${totalPages})</b>\n` +
      `Total Users: <code>${usersList.length}</code>\n\n` +
      (lines || "<i>No registered users found.</i>") +
      `\nTap any user button below to inspect full details or modify balance:`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: inlineRows },
  });
}

async function sendAdminUserInspectionCard(db, env, chatId, targetUserId, cfg) {
  const u = await getJson(db, `user:${targetUserId}:data`, null);
  if (!u) {
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `❌ User ID <code>${escapeHtml(targetUserId)}</code> was not found in the database.`,
      parse_mode: "HTML",
      reply_markup: buildAdminKeyboard(),
    });
    return;
  }

  const statusText = u.banned ? "🚫 BANNED" : "🟢 ACTIVE";
  await callApi(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text:
      `🔍 <b>User Inspection Profile</b>\n\n` +
      `• <b>User ID:</b> <code>${u.id}</code>\n` +
      `• <b>Name:</b> ${escapeHtml(u.first_name)}\n` +
      `• <b>Username:</b> ${u.username ? `@${escapeHtml(u.username)}` : "<i>None</i>"}\n` +
      `• <b>Account Status:</b> <b>${statusText}</b>\n\n` +
      `💼 <b>Financial Overview:</b>\n` +
      `• <b>Current Wallet Balance:</b> <b>₹${u.balance || 0}</b>\n` +
      `• <b>Total Lifetime Earned:</b> ₹${u.total_earned || 0}\n` +
      `• <b>Total Withdrawn:</b> ₹${u.total_withdrawn || 0}\n` +
      `• <b>Referrals:</b> ${u.referral_count || 0} users (₹${u.referral_earnings || 0})\n\n` +
      `📦 <b>Activity Summary:</b>\n` +
      `• <b>Total Buy Orders:</b> <code>${(u.orders || []).length}</code>\n` +
      `• <b>Total Sell Submissions:</b> <code>${(u.sells || []).length}</code>\n` +
      `• <b>Total Payout Requests:</b> <code>${(u.payouts || []).length}</code>\n` +
      `• <b>Joined At:</b> <code>${u.joined_at ? u.joined_at.slice(0, 10) : "N/A"}</code>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Add Balance", callback_data: `admin_bal_add:${u.id}` },
          { text: "➖ Deduct Balance", callback_data: `admin_bal_sub:${u.id}` },
        ],
        [
          {
            text: u.banned ? "✅ Unban User" : "🚫 Ban User",
            callback_data: `admin_toggle_ban:${u.id}`,
          },
        ],
      ],
    },
  });
}

async function handleAdminMenuAction(text, db, env, chatId, cfg) {
  if (text === ADMIN_BUTTONS.ADD_GMAIL_STOCK) {
    await setUserState(db, chatId, "ADMIN_ADD_STOCK", { platform: "GMAIL" });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `➕ <b>Bulk Add Gmail Stock (Clean Format)</b>\n\n` +
        `Paste your Gmail accounts below (one per line) using simple space separation (no colons required):\n` +
        `<code>email@gmail.com Password123</code>\n` +
        `or with optional recovery mail:\n` +
        `<code>email@gmail.com Password123 recovery@gmail.com</code>`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return true;
  }

  if (text === ADMIN_BUTTONS.ADD_FB_STOCK) {
    await setUserState(db, chatId, "ADMIN_ADD_STOCK", { platform: "FACEBOOK" });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `➕ <b>Bulk Add Facebook Stock (Clean Format)</b>\n\n` +
        `Paste your Facebook accounts below (one per line) using simple space separation:\n` +
        `<code>10008927364512 Pass@9921</code>\n` +
        `or with optional recovery mail / 2FA note:\n` +
        `<code>fbuser@mail.com Pass@9921 recovery@mail.com</code>`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return true;
  }

  if (text === ADMIN_BUTTONS.STATS) {
    await sendAdminDashboardSummary(db, env, chatId, cfg);
    return true;
  }

  if (text === ADMIN_BUTTONS.USER_LIST) {
    await sendAdminUserList(db, env, chatId, 0);
    return true;
  }

  if (text === ADMIN_BUTTONS.INSPECT_USER) {
    await setUserState(db, chatId, "ADMIN_INSPECT_USER_PROMPT");
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `🔍 <b>Inspect Specific User</b>\n\n` +
        `Enter the numeric <b>Telegram User ID</b> of the user you want to inspect:`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return true;
  }

  if (text === ADMIN_BUTTONS.RATES_CONFIG) {
    await sendRatesConfigurationMenu(env, chatId, cfg);
    return true;
  }

  if (text === ADMIN_BUTTONS.PENDING_BUYS) {
    const buyQueue = await getJson(db, "PENDING_BUY_QUEUE", []);
    if (buyQueue.length === 0) {
      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: "✅ <b>Pending Buy Orders Queue is empty!</b> All buy orders have been processed.",
        parse_mode: "HTML",
      });
      return true;
    }

    for (const ordId of buyQueue.slice(0, 10)) {
      const ord = await getJson(db, `orders:${ordId}`, null);
      if (!ord || ord.status !== "PENDING") continue;
      const pLabel = ord.platform === "FACEBOOK" ? "Facebook" : "Gmail";
      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `🛒 <b>Pending ${pLabel} Buy Order #${ord.id}</b>\n` +
          `• <b>Buyer:</b> ${escapeHtml(ord.buyer_name)} (<code>${ord.buyer_id}</code>)\n` +
          `• <b>Quantity:</b> <code>${ord.quantity}</code> ${pLabel} account(s)\n` +
          `• <b>Total Paid:</b> <b>₹${ord.total_inr}</b>\n` +
          `• <b>Proof:</b> <code>${escapeHtml(ord.proof_text)}</code>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `✅ Approve Order #${ord.id}`,
                callback_data: `approve_buy:${ord.id}`,
              },
            ],
            [
              {
                text: `❌ Reject Order #${ord.id}`,
                callback_data: `reject_buy:${ord.id}`,
              },
            ],
          ],
        },
      });
    }
    return true;
  }

  if (text === ADMIN_BUTTONS.PENDING_SELLS) {
    const queue = await getJson(db, "PENDING_SELL_QUEUE", []);
    if (queue.length === 0) {
      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: "✅ <b>Pending Sell Queue is empty!</b> All user submissions have been processed.",
        parse_mode: "HTML",
      });
      return true;
    }

    for (const sellId of queue.slice(0, 10)) {
      const sell = await getJson(db, `sells:${sellId}`, null);
      if (!sell || sell.status !== "PENDING") continue;
      const pLabel = sell.platform === "FACEBOOK" ? "Facebook" : "Gmail";
      const preview = sell.accounts
        .map((a, i) => formatCredentialCard(a, i, sell.platform || "GMAIL"))
        .join("\n\n");
      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `📥 <b>Pending ${pLabel} Sell #${sell.id}</b>\n` +
          `• <b>Seller:</b> ${escapeHtml(sell.seller_name)} (<code>${sell.seller_id}</code>)\n` +
          `• <b>Credit Amount:</b> <b>₹${sell.payout_inr}</b>\n\n` +
          `${preview}`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `✅ Approve & Credit ₹${sell.payout_inr}`,
                callback_data: `approve_sell:${sell.id}`,
              },
            ],
            [
              {
                text: `❌ Reject Submission`,
                callback_data: `reject_sell:${sell.id}`,
              },
            ],
          ],
        },
      });
    }
    return true;
  }

  if (text === ADMIN_BUTTONS.PAYOUTS) {
    const pendingList = await getJson(db, "payouts:pending_list", []);
    if (pendingList.length === 0) {
      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: "✅ <b>No Pending Payouts!</b> All withdrawal requests are settled.",
        parse_mode: "HTML",
      });
      return true;
    }

    for (const payoutId of pendingList.slice(0, 10)) {
      const payout = await getJson(db, `payouts:${payoutId}`, null);
      if (!payout || payout.status !== "PENDING") continue;
      await callApi(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text:
          `💳 <b>Pending Payout #${payout.id}</b>\n` +
          `• <b>User:</b> ${escapeHtml(payout.user_name)} (<code>${payout.user_id}</code>)\n` +
          `• <b>Amount:</b> <b>₹${payout.amount_inr}</b> (~$${payout.amount_usdt} USDT)\n` +
          `• <b>Destination:</b> <code>${escapeHtml(payout.details)}</code>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Mark Paid", callback_data: `payout_paid:${payout.id}` },
              {
                text: "❌ Reject Refund",
                callback_data: `payout_reject:${payout.id}`,
              },
            ],
          ],
        },
      });
    }
    return true;
  }

  if (text === ADMIN_BUTTONS.ADMINS) {
    const admins = await getJson(db, "admins:list", []);
    const inlineRows = admins.map((aid) => [
      {
        text: `🗑 Remove Admin ${aid}`,
        callback_data: `remove_admin:${aid}`,
      },
    ]);
    inlineRows.push([
      { text: "➕ Add New Sub-Admin", callback_data: "add_admin_prompt" },
    ]);

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `🛡 <b>Admin Manager</b>\n\n` +
        `• <b>Primary Owner ID:</b> <code>${escapeHtml(env.OWNER_ID || "Unset")}</code>\n` +
        `• <b>Sub-Admins Count:</b> <code>${admins.length}</code>\n` +
        (admins.length > 0
          ? `\n<b>Active Sub-Admins:</b>\n${admins.map((a) => `• <code>${a}</code>`).join("\n")}`
          : "\n<i>No sub-admins added yet.</i>"),
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineRows },
    });
    return true;
  }

  if (text === ADMIN_BUTTONS.BROADCAST) {
    await setUserState(db, chatId, "ADMIN_BROADCAST_MSG");
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `📢 <b>Global Broadcast Message</b>\n\n` +
        `Enter the message you want to broadcast to all registered users (HTML tags supported):`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return true;
  }

  if (text === ADMIN_BUTTONS.MAINTENANCE) {
    const current = await getJson(db, "system:maintenance", false);
    const nextState = !current;
    await putJson(db, "system:maintenance", nextState);
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `🔧 <b>Maintenance Mode Updated</b>\n\n` +
        `Current Status: <b>${nextState ? "🔴 ENABLED (Regular users blocked)" : "🟢 DISABLED (Bot open for all users)"}</b>`,
      parse_mode: "HTML",
      reply_markup: buildAdminKeyboard(),
    });
    return true;
  }

  return false;
}

/**
 * Callback Query Handler (Inline Buttons)
 */
async function handleCallbackQuery(callbackQuery, env) {
  const db = env.DB;
  const callbackId = callbackQuery.id;
  const data = callbackQuery.data || "";
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  if (!chatId) return;

  const user = await getUserData(db, chatId, callbackQuery.from || {});
  const isAdmin = await isAdminUser(db, env, chatId);
  const cfg = await getSystemConfig(db);
  const fmt = (val) => formatCurrency(val, user.currency, cfg.USDT_RATE_INR);

  // 1. Force Channel Join Verification Callback
  if (data === "verify_join") {
    const isMember = await checkForceChannelMembership(env, chatId);
    if (!isMember) {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "❌ You haven't joined the channel yet! Please join first and try again.",
        show_alert: true,
      });
      return;
    }

    await processReferralRewardIfEligible(db, env, user, cfg);

    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
      text: "✅ Membership verified! Welcome!",
    });

    await sendMainMenu(db, env, chatId, user, isAdmin, cfg);
    return;
  }

  // 2. Settings Inline Toggles
  if (data === "toggle_lang" || data === "toggle_notif" || data === "toggle_currency") {
    if (data === "toggle_lang") {
      user.lang = user.lang === "hi" ? "en" : "hi";
    } else if (data === "toggle_notif") {
      user.notifications = user.notifications === false ? true : false;
    } else if (data === "toggle_currency") {
      user.currency = user.currency === "USDT" ? "INR" : "USDT";
    }
    await saveUserData(db, chatId, user);

    const updatedDict = I18N[user.lang] || I18N.en;
    const updatedFmt = (val) => formatCurrency(val, user.currency, cfg.USDT_RATE_INR);

    await callApi(env.BOT_TOKEN, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: updatedDict.settings_title(user, updatedFmt, cfg),
      parse_mode: "HTML",
      reply_markup: buildSettingsInlineKeyboard(user),
    });

    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
      text: "✅ Preference updated!",
    });
    return;
  }

  // 3. Wallet & Withdrawal Callbacks (Strict ₹100 Minimum)
  if (data === "initiate_withdraw") {
    const minWithdraw = Number(cfg.MIN_WITHDRAW_INR) || 100;
    if ((Number(user.balance) || 0) < minWithdraw) {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: `❌ Minimum withdrawal is strictly ₹${minWithdraw}. Your current balance is ₹${user.balance || 0}.`,
        show_alert: true,
      });
      return;
    }

    await setUserState(db, chatId, "WITHDRAW_AWAIT_AMOUNT");
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `💸 <b>Request Wallet Withdrawal</b>\n\n` +
        `• <b>Available Balance:</b> <b>${fmt(user.balance)}</b>\n` +
        `• <b>Minimum Withdrawal Limit:</b> <b>₹${minWithdraw}</b>\n\n` +
        `🔢 <b>Enter the amount (in INR) you wish to withdraw (min ₹${minWithdraw}):</b>`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }

  if (data === "withdraw_history") {
    const recentPayouts = (user.payouts || []).slice(-5).reverse();
    let lines = "";
    if (recentPayouts.length === 0) {
      lines = "<i>No withdrawal requests yet.</i>";
    } else {
      for (const pid of recentPayouts) {
        const p = await getJson(db, `payouts:${pid}`, null);
        if (p) {
          const statusIcon =
            p.status === "PAID"
              ? "✅ Paid"
              : p.status === "REJECTED"
              ? "❌ Refunded"
              : "⏳ Pending";
          lines += `• <code>${p.id}</code> — ${fmt(p.amount_inr)} (${escapeHtml(p.details)}) — <b>${statusIcon}</b>\n`;
        }
      }
    }

    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `📜 <b>Recent Withdrawal History</b>\n\n${lines}`,
      parse_mode: "HTML",
    });
    return;
  }

  // 4. Admin-Only Callback Actions
  if (!isAdmin) {
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
      text: "⛔ Unauthorized action.",
      show_alert: true,
    });
    return;
  }

  // User List Pagination & User Inspection Callbacks
  if (data.startsWith("users_page:")) {
    const page = parseInt(data.split(":")[1], 10) || 0;
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await sendAdminUserList(db, env, chatId, page);
    return;
  }

  if (data.startsWith("inspect_user:")) {
    const targetUserId = data.split(":")[1];
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await sendAdminUserInspectionCard(db, env, chatId, targetUserId, cfg);
    return;
  }

  if (data.startsWith("admin_bal_add:") || data.startsWith("admin_bal_sub:")) {
    const [actionType, targetUserId] = data.split(":");
    const mode = actionType === "admin_bal_add" ? "ADD" : "SUB";
    await setUserState(db, chatId, "ADMIN_ADJUST_USER_BALANCE", { targetUserId, mode });
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        mode === "ADD"
          ? `➕ <b>Enter the INR amount to ADD to User <code>${targetUserId}</code>'s wallet:</b>`
          : `➖ <b>Enter the INR amount to DEDUCT from User <code>${targetUserId}</code>'s wallet:</b>`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }

  if (data.startsWith("admin_toggle_ban:")) {
    const targetUserId = data.split(":")[1];
    const targetUser = await getJson(db, `user:${targetUserId}:data`, null);
    if (!targetUser) {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "User not found.",
        show_alert: true,
      });
      return;
    }
    targetUser.banned = !targetUser.banned;
    await saveUserData(db, targetUserId, targetUser);
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
      text: targetUser.banned ? "🚫 User Banned" : "✅ User Unbanned",
    });
    await sendAdminUserInspectionCard(db, env, chatId, targetUserId, cfg);
    return;
  }

  // Dynamic Rates & Financial Rules Setter Callback
  if (data.startsWith("set_rate:")) {
    const rateKey = data.split(":")[1];
    const labels = {
      BUY_GMAIL_INR: "Buy Gmail Rate (INR)",
      SELL_GMAIL_INR: "Sell Gmail Rate (INR)",
      BUY_FB_INR: "Buy Facebook Rate (INR)",
      SELL_FB_INR: "Sell Facebook Rate (INR)",
      MIN_WITHDRAW_INR: "Minimum Withdrawal Limit (INR)",
      REF_BONUS_INR: "Referral Bonus (INR)",
      USDT_RATE_INR: "1 USDT Conversion Rate (INR)",
    };
    await setUserState(db, chatId, "ADMIN_SET_RATE_VALUE", { rateKey });
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text:
        `⚙️ <b>Update ${labels[rateKey] || rateKey}</b>\n\n` +
        `Current Value: <b>₹${cfg[rateKey]}</b>\n` +
        `🔢 Enter the new numeric value in INR:`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }

  // Approve Buy Order (Supports both Gmail & Facebook, Clean Colon-Free Delivery + Recovery Notice)
  if (data.startsWith("approve_buy:")) {
    const orderId = data.split(":")[1];
    const order = await getJson(db, `orders:${orderId}`, null);
    if (!order || order.status !== "PENDING") {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "⚠️ Order already processed or not found.",
        show_alert: true,
      });
      return;
    }

    const isFb = order.platform === "FACEBOOK";
    const stockKey = isFb ? "stock:facebook" : "stock:gmails";
    const pLabel = isFb ? "Facebook" : "Gmail";

    const stock = await getJson(db, stockKey, []);
    if (stock.length < order.quantity) {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: `❌ Insufficient ${pLabel} stock! Need ${order.quantity}, but only ${stock.length} available. Add stock first.`,
        show_alert: true,
      });
      return;
    }

    const deliveredAccounts = stock.splice(0, order.quantity);
    await putJson(db, stockKey, stock);

    order.status = "APPROVED";
    order.delivered_accounts = deliveredAccounts;
    order.processed_by = String(chatId);
    order.processed_at = new Date().toISOString();
    await putJson(db, `orders:${orderId}`, order);

    const buyQueue = await getJson(db, "PENDING_BUY_QUEUE", []);
    await putJson(
      db,
      "PENDING_BUY_QUEUE",
      buyQueue.filter((id) => id !== orderId)
    );

    const formattedList = deliveredAccounts
      .map((acc, idx) => formatCredentialCard(acc, idx, order.platform || "GMAIL"))
      .join("\n\n");

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: order.buyer_id,
      text:
        `🎉 <b>Order Approved & ${pLabel} Accounts Delivered!</b>\n\n` +
        `• <b>Order ID:</b> <code>${order.id}</code>\n` +
        `• <b>Service:</b> ${pLabel}\n` +
        `• <b>Quantity Delivered:</b> <code>${order.quantity}</code> Account(s)\n\n` +
        `🔐 <b>Your Account Credentials (Clean Direct Format):</b>\n\n` +
        `${formattedList}\n\n` +
        `🛡 <b>Important Security & Recovery Notice:</b>\n` +
        `Please sign in immediately, update the password, and bind your own recovery email / 2FA to secure your accounts.`,
      parse_mode: "HTML",
    });

    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
      text: `✅ Order #${orderId} approved & ${order.quantity} ${pLabel} accounts delivered!`,
    });

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Order #${orderId} Approved!</b> Delivered ${order.quantity}x ${pLabel} accounts to <code>${order.buyer_id}</code>. Remaining ${pLabel} stock: <code>${stock.length}</code>.`,
      parse_mode: "HTML",
    });
    return;
  }

  // Reject Buy Order
  if (data.startsWith("reject_buy:")) {
    const orderId = data.split(":")[1];
    const order = await getJson(db, `orders:${orderId}`, null);
    if (!order || order.status !== "PENDING") {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "⚠️ Order already processed.",
        show_alert: true,
      });
      return;
    }

    await setUserState(db, chatId, "ADMIN_REJECT_BUY_REASON", { orderId });
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `📝 <b>Enter Rejection Reason for Buy Order #${orderId}:</b>\n(This note will be sent directly to the buyer)`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }

  // Approve Sell Submission (Supports both Gmail & Facebook)
  if (data.startsWith("approve_sell:")) {
    const sellId = data.split(":")[1];
    const sell = await getJson(db, `sells:${sellId}`, null);
    if (!sell || sell.status !== "PENDING") {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "⚠️ Submission already processed.",
        show_alert: true,
      });
      return;
    }

    const isFb = sell.platform === "FACEBOOK";
    const stockKey = isFb ? "stock:facebook" : "stock:gmails";
    const pLabel = isFb ? "Facebook" : "Gmail";

    sell.status = "APPROVED";
    sell.processed_by = String(chatId);
    sell.processed_at = new Date().toISOString();
    await putJson(db, `sells:${sellId}`, sell);

    const queue = await getJson(db, "PENDING_SELL_QUEUE", []);
    await putJson(
      db,
      "PENDING_SELL_QUEUE",
      queue.filter((id) => id !== sellId)
    );

    const stock = await getJson(db, stockKey, []);
    stock.push(...sell.accounts);
    await putJson(db, stockKey, stock);

    const seller = await getUserData(db, sell.seller_id);
    seller.balance = (Number(seller.balance) || 0) + Number(sell.payout_inr);
    seller.total_earned =
      (Number(seller.total_earned) || 0) + Number(sell.payout_inr);
    await saveUserData(db, sell.seller_id, seller);

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: sell.seller_id,
      text:
        `✅ <b>${pLabel} Sell Submission Approved!</b>\n\n` +
        `• <b>Submission ID:</b> <code>${sell.id}</code>\n` +
        `• <b>Verified ${pLabel} Accounts:</b> <code>${sell.accounts.length}</code>\n` +
        `• <b>Credited to Wallet:</b> <b>+₹${sell.payout_inr}</b>\n` +
        `• <b>New Wallet Balance:</b> <b>₹${seller.balance}</b>`,
      parse_mode: "HTML",
    });

    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
      text: `✅ Approved! Credited ₹${sell.payout_inr} & added to ${pLabel} stock.`,
    });

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Sell #${sellId} Approved!</b> Added ${sell.accounts.length}x accounts to ${pLabel} stock (Total: <code>${stock.length}</code>) and credited ₹${sell.payout_inr} to seller <code>${sell.seller_id}</code>.`,
      parse_mode: "HTML",
    });
    return;
  }

  // Reject Sell Submission
  if (data.startsWith("reject_sell:")) {
    const sellId = data.split(":")[1];
    const sell = await getJson(db, `sells:${sellId}`, null);
    if (!sell || sell.status !== "PENDING") {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "⚠️ Submission already processed.",
        show_alert: true,
      });
      return;
    }

    await setUserState(db, chatId, "ADMIN_REJECT_SELL_REASON", { sellId });
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `📝 <b>Enter Rejection Reason for Sell Submission #${sellId}:</b>`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }

  // Mark Payout Paid
  if (data.startsWith("payout_paid:")) {
    const payoutId = data.split(":")[1];
    const payout = await getJson(db, `payouts:${payoutId}`, null);
    if (!payout || payout.status !== "PENDING") {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "⚠️ Payout already processed.",
        show_alert: true,
      });
      return;
    }

    payout.status = "PAID";
    payout.processed_by = String(chatId);
    payout.processed_at = new Date().toISOString();
    await putJson(db, `payouts:${payoutId}`, payout);

    const pendingList = await getJson(db, "payouts:pending_list", []);
    await putJson(
      db,
      "payouts:pending_list",
      pendingList.filter((id) => id !== payoutId)
    );

    const targetUser = await getUserData(db, payout.user_id);
    targetUser.total_withdrawn =
      (Number(targetUser.total_withdrawn) || 0) + Number(payout.amount_inr);
    await saveUserData(db, payout.user_id, targetUser);

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: payout.user_id,
      text:
        `💸 <b>Withdrawal Paid Successfully!</b>\n\n` +
        `• <b>Payout ID:</b> <code>${payout.id}</code>\n` +
        `• <b>Amount Disbursed:</b> <b>₹${payout.amount_inr}</b> (~$${payout.amount_usdt} USDT)\n` +
        `• <b>Destination:</b> <code>${escapeHtml(payout.details)}</code>\n\n` +
        `Thank you for trading with Zenox Mail & Social Master Pro!`,
      parse_mode: "HTML",
    });

    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
      text: `✅ Payout #${payoutId} marked as PAID!`,
    });

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Payout #${payoutId} Marked Paid!</b> User <code>${payout.user_id}</code> has been notified.`,
      parse_mode: "HTML",
    });
    return;
  }

  // Reject Payout & Refund
  if (data.startsWith("payout_reject:")) {
    const payoutId = data.split(":")[1];
    const payout = await getJson(db, `payouts:${payoutId}`, null);
    if (!payout || payout.status !== "PENDING") {
      await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "⚠️ Payout already processed.",
        show_alert: true,
      });
      return;
    }

    await setUserState(db, chatId, "ADMIN_REJECT_PAYOUT_REASON", { payoutId });
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `📝 <b>Enter Reason for Rejecting & Refunding Payout #${payoutId}:</b>`,
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }

  // Admin Manager Callbacks
  if (data === "add_admin_prompt") {
    await setUserState(db, chatId, "ADMIN_ADD_SUBADMIN");
    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
    });
    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "👤 <b>Send the numeric Telegram User ID of the new Sub-Admin:</b>",
      parse_mode: "HTML",
      reply_markup: buildCancelKeyboard(),
    });
    return;
  }

  if (data.startsWith("remove_admin:")) {
    const removeId = data.split(":")[1];
    const admins = await getJson(db, "admins:list", []);
    const updated = admins.filter((id) => String(id) !== String(removeId));
    await putJson(db, "admins:list", updated);

    await callApi(env.BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: callbackId,
      text: `🗑 Removed Sub-Admin ${removeId}`,
    });

    await callApi(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `✅ Sub-Admin <code>${removeId}</code> has been removed.`,
      parse_mode: "HTML",
      reply_markup: buildAdminKeyboard(),
    });
    return;
  }
}

/**
 * Cloudflare Worker ES Module Entrypoint
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Optional helper endpoint to register Telegram Webhook automatically
    if (request.method === "GET" && url.pathname === "/register-webhook") {
      if (!env.BOT_TOKEN) {
        return new Response("Missing BOT_TOKEN environment variable", { status: 500 });
      }
      const webhookUrl = `${url.origin}/`;
      const result = await callApi(env.BOT_TOKEN, "setWebhook", {
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      });
      return new Response(JSON.stringify({ webhookUrl, result }, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "online",
          service: "Zenox Mail & Social Master Pro Worker",
          kv_bound: Boolean(env.DB),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (request.method === "POST") {
      try {
        const update = await request.json();
        const processPromise = (async () => {
          if (update.message) {
            await handleMessage(update.message, env);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query, env);
          }
        })();

        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(processPromise);
        } else {
          await processPromise;
        }

        return new Response("OK", { status: 200 });
      } catch (err) {
        console.error("Webhook POST Error:", err);
        return new Response("OK", { status: 200 });
      }
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
};
