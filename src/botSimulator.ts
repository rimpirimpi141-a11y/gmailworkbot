import worker from '../worker.js';

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface ReplyButton {
  text: string;
}

export interface SimMessage {
  message_id: number;
  chat_id: string;
  sender: 'bot' | 'user';
  text: string;
  photo?: string;
  timestamp: string;
  inline_keyboard?: InlineButton[][];
}

export interface SimToast {
  id: string;
  chat_id: string;
  text: string;
  show_alert?: boolean;
}

export interface SimulatorSnapshot {
  messages: Record<string, SimMessage[]>;
  replyKeyboards: Record<string, ReplyButton[][]>;
  toasts: Record<string, SimToast | null>;
  kvEntries: Array<{ key: string; value: string }>;
  channelMemberships: Record<string, boolean>;
  envVars: {
    BOT_TOKEN: string;
    OWNER_ID: string;
    SUPPORT_USERNAME: string;
    FORCE_CHANNEL: string;
    UPI_DETAILS: string;
  };
}

export const SIM_USERS = {
  USER: {
    id: '800101',
    first_name: 'Aarav Sharma',
    username: 'aarav_trader',
    roleLabel: 'Regular User',
  },
  ADMIN: {
    id: '999001',
    first_name: 'Zenox Owner',
    username: 'ZenoxAdmin',
    roleLabel: 'Owner (OWNER_ID)',
  },
};

class InMemoryKVNamespace {
  private store = new Map<string, string>();
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, String(value));
    this.onChange();
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.onChange();
  }

  entries(): Array<{ key: string; value: string }> {
    return Array.from(this.store.entries())
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  clearAndSeed(initial: Record<string, unknown>) {
    this.store.clear();
    for (const [k, v] of Object.entries(initial)) {
      this.store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    this.onChange();
  }
}

export class TelegramWorkerSimulator {
  private kv: InMemoryKVNamespace;
  private messages: Record<string, SimMessage[]> = {
    [SIM_USERS.USER.id]: [],
    [SIM_USERS.ADMIN.id]: [],
  };
  private replyKeyboards: Record<string, ReplyButton[][]> = {
    [SIM_USERS.USER.id]: [],
    [SIM_USERS.ADMIN.id]: [],
  };
  private toasts: Record<string, SimToast | null> = {
    [SIM_USERS.USER.id]: null,
    [SIM_USERS.ADMIN.id]: null,
  };
  private channelMemberships: Record<string, boolean> = {
    [SIM_USERS.USER.id]: true,
    [SIM_USERS.ADMIN.id]: true,
  };
  private nextMsgId = 100;
  private listeners = new Set<() => void>();

  public envVars = {
    BOT_TOKEN: '7192837465:AAH_ZenoxCloudflareWorkerBotToken',
    OWNER_ID: SIM_USERS.ADMIN.id,
    SUPPORT_USERNAME: '@ZenoxWorker',
    FORCE_CHANNEL: '@ZenoxUpdates',
    UPI_DETAILS: 'zenoxexchange@upi (Pay & submit 12-digit UTR or Screenshot)',
  };

  constructor() {
    this.kv = new InMemoryKVNamespace(() => this.notify());
    this.seedInitialState();
  }

  public seedInitialState() {
    this.messages = {
      [SIM_USERS.USER.id]: [],
      [SIM_USERS.ADMIN.id]: [],
    };
    this.replyKeyboards = {
      [SIM_USERS.USER.id]: [],
      [SIM_USERS.ADMIN.id]: [],
    };
    this.channelMemberships = {
      [SIM_USERS.USER.id]: true,
      [SIM_USERS.ADMIN.id]: true,
    };

    const now = new Date().toISOString();
    this.kv.clearAndSeed({
      'stock:gmails': [
        'rohan.verma2026@gmail.com:Rohan#8821:recovery.rohan@gmail.com',
        'priya.nair.dev@gmail.com:Priya$9910:pnair.backup@gmail.com',
        'vikram.singh.hq@gmail.com:Vikram@4412:vsingh.recov@gmail.com',
        'ananya.k.studio@gmail.com:Ananya!7734:ananya.alt@gmail.com',
        'kabir.mehta.pro@gmail.com:Kabir*5590:kabir.rec@gmail.com',
      ],
      'users:list': [SIM_USERS.ADMIN.id, SIM_USERS.USER.id],
      'admins:list': [],
      'PENDING_SELL_QUEUE': [],
      'payouts:pending_list': [],
      'system:maintenance': false,
      [`user:${SIM_USERS.USER.id}:data`]: {
        id: SIM_USERS.USER.id,
        first_name: SIM_USERS.USER.first_name,
        username: SIM_USERS.USER.username,
        balance: 65,
        total_earned: 65,
        total_withdrawn: 0,
        referred_by: null,
        ref_rewarded: false,
        referral_count: 2,
        referral_earnings: 4,
        lang: 'en',
        notifications: true,
        currency: 'INR',
        orders: [],
        sells: [],
        payouts: [],
        joined_at: now,
        updated_at: now,
      },
      [`user:${SIM_USERS.ADMIN.id}:data`]: {
        id: SIM_USERS.ADMIN.id,
        first_name: SIM_USERS.ADMIN.first_name,
        username: SIM_USERS.ADMIN.username,
        balance: 250,
        total_earned: 250,
        total_withdrawn: 100,
        referred_by: null,
        ref_rewarded: false,
        referral_count: 5,
        referral_earnings: 10,
        lang: 'en',
        notifications: true,
        currency: 'INR',
        orders: [],
        sells: [],
        payouts: [],
        joined_at: now,
        updated_at: now,
      },
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  public getSnapshot(): SimulatorSnapshot {
    return {
      messages: {
        [SIM_USERS.USER.id]: [...(this.messages[SIM_USERS.USER.id] || [])],
        [SIM_USERS.ADMIN.id]: [...(this.messages[SIM_USERS.ADMIN.id] || [])],
      },
      replyKeyboards: {
        [SIM_USERS.USER.id]: [...(this.replyKeyboards[SIM_USERS.USER.id] || [])],
        [SIM_USERS.ADMIN.id]: [...(this.replyKeyboards[SIM_USERS.ADMIN.id] || [])],
      },
      toasts: { ...this.toasts },
      kvEntries: this.kv.entries(),
      channelMemberships: { ...this.channelMemberships },
      envVars: { ...this.envVars },
    };
  }

  public setChannelMembership(chatId: string, joined: boolean) {
    this.channelMemberships[chatId] = joined;
    if (!joined) {
      // Also reset ref_rewarded so user can test referral bonus on verification
      this.kv.get(`user:${chatId}:data`).then((raw) => {
        if (raw) {
          const data = JSON.parse(raw);
          data.ref_rewarded = false;
          this.kv.put(`user:${chatId}:data`, JSON.stringify(data));
        }
      });
    }
    this.notify();
  }

  public clearToast(chatId: string) {
    this.toasts[chatId] = null;
    this.notify();
  }

  private async withTelegramFetchMock<T>(fn: () => Promise<T>): Promise<T> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith('https://api.telegram.org/bot')) {
        const method = urlStr.split('/').pop() || '';
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const apiResult = this.handleTelegramApiCall(method, body);
        return new Response(JSON.stringify(apiResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };

    try {
      return await fn();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  private handleTelegramApiCall(method: string, payload: Record<string, any>) {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (method === 'getMe') {
      return {
        ok: true,
        result: {
          id: 777000,
          is_bot: true,
          first_name: 'Zenox Gmail Exchange',
          username: 'ZenoxGmailBot',
        },
      };
    }

    if (method === 'getChatMember') {
      const uid = String(payload.user_id);
      const isJoined = this.channelMemberships[uid] ?? true;
      return {
        ok: true,
        result: {
          status: isJoined ? 'member' : 'left',
          user: { id: Number(uid), is_bot: false, first_name: 'User' },
        },
      };
    }

    if (method === 'sendMessage' || method === 'sendPhoto') {
      const chatId = String(payload.chat_id);
      const msgId = ++this.nextMsgId;
      const text = payload.text || payload.caption || '';
      const replyMarkup = payload.reply_markup;

      if (replyMarkup?.keyboard) {
        this.replyKeyboards[chatId] = replyMarkup.keyboard;
      }

      const newMsg: SimMessage = {
        message_id: msgId,
        chat_id: chatId,
        sender: 'bot',
        text,
        photo: method === 'sendPhoto' ? payload.photo : undefined,
        timestamp: nowTime,
        inline_keyboard: replyMarkup?.inline_keyboard,
      };

      this.messages[chatId] = [...(this.messages[chatId] || []), newMsg];
      this.notify();

      return { ok: true, result: { message_id: msgId } };
    }

    if (method === 'editMessageText') {
      const chatId = String(payload.chat_id);
      const msgId = Number(payload.message_id);
      const list = this.messages[chatId] || [];
      this.messages[chatId] = list.map((m) =>
        m.message_id === msgId
          ? {
              ...m,
              text: payload.text || m.text,
              inline_keyboard: payload.reply_markup?.inline_keyboard ?? m.inline_keyboard,
            }
          : m
      );
      this.notify();
      return { ok: true, result: true };
    }

    if (method === 'answerCallbackQuery') {
      if (payload.text) {
        const targetChatId = String(payload._sim_chat_id || SIM_USERS.USER.id);
        this.toasts[targetChatId] = {
          id: String(Date.now()),
          chat_id: targetChatId,
          text: payload.text,
          show_alert: Boolean(payload.show_alert),
        };
        this.notify();
      }
      return { ok: true, result: true };
    }

    return { ok: true, result: true };
  }

  public async sendUserMessage(chatId: string, text: string, withMockPhoto = false) {
    const profile = chatId === SIM_USERS.ADMIN.id ? SIM_USERS.ADMIN : SIM_USERS.USER;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = ++this.nextMsgId;

    const userMsg: SimMessage = {
      message_id: msgId,
      chat_id: chatId,
      sender: 'user',
      text: text || (withMockPhoto ? '📸 [Payment Screenshot Attached]' : ''),
      photo: withMockPhoto ? 'mock_payment_receipt_file_id' : undefined,
      timestamp: nowTime,
    };

    this.messages[chatId] = [...(this.messages[chatId] || []), userMsg];
    this.notify();

    const webhookPayload: Record<string, any> = {
      update_id: Date.now(),
      message: {
        message_id: msgId,
        from: {
          id: Number(profile.id),
          is_bot: false,
          first_name: profile.first_name,
          username: profile.username,
        },
        chat: {
          id: Number(profile.id),
          first_name: profile.first_name,
          username: profile.username,
          type: 'private',
        },
        date: Math.floor(Date.now() / 1000),
        text: withMockPhoto ? undefined : text,
        caption: withMockPhoto ? text : undefined,
        photo: withMockPhoto
          ? [{ file_id: 'AgACAgUAAxkBAAIB_PaymentScreenshot_UTR99281726', width: 800, height: 1200 }]
          : undefined,
      },
    };

    const req = new Request('https://zenox-gmail-bot.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    await this.withTelegramFetchMock(async () => {
      await worker.fetch(req, { ...this.envVars, DB: this.kv }, {});
    });
  }

  public async triggerCallbackQuery(chatId: string, messageId: number, callbackData: string) {
    const profile = chatId === SIM_USERS.ADMIN.id ? SIM_USERS.ADMIN : SIM_USERS.USER;
    const webhookPayload = {
      update_id: Date.now(),
      callback_query: {
        id: `${chatId}_${Date.now()}`,
        from: {
          id: Number(profile.id),
          is_bot: false,
          first_name: profile.first_name,
          username: profile.username,
        },
        message: {
          message_id: messageId,
          chat: {
            id: Number(profile.id),
            type: 'private',
          },
        },
        data: callbackData,
      },
    };

    const req = new Request('https://zenox-gmail-bot.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    await this.withTelegramFetchMock(async () => {
      // Also attach chatId hint to answerCallbackQuery
      const origHandle = this.handleTelegramApiCall.bind(this);
      this.handleTelegramApiCall = (method: string, payload: Record<string, any>) => {
        if (method === 'answerCallbackQuery') {
          payload._sim_chat_id = chatId;
        }
        return origHandle(method, payload);
      };
      try {
        await worker.fetch(req, { ...this.envVars, DB: this.kv }, {});
      } finally {
        this.handleTelegramApiCall = origHandle;
      }
    });
  }
}

export const botSimulator = new TelegramWorkerSimulator();
