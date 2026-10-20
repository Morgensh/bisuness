// Telegram WebApp, сохранения, механика спасения

const BackendBridge = {
  tg: window.Telegram ? window.Telegram.WebApp : null,

  init() {
    if (this.tg) {
      try {
        this.tg.ready();
        this.tg.expand();
      } catch (e) {}
    }
  },

  getUserId() {
    return this.tg?.initDataUnsafe?.user?.id || 'offline_user';
  },

  shareInvite(reviveKey) {
    const text = 'Спаси мою колонию на планете Кеплер-7! Перейди по ссылке, чтобы доставить припасы:';
    const link = `https://t.me/${CFG.TELEGRAM_BOT}?start=rescue_${reviveKey}_${this.getUserId()}`;

    if (this.tg?.openTelegramLink) {
      this.tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    } else if (navigator.share) {
      navigator.share({ title: 'Колония: Кеплер-7', text, url: link }).catch(() => {});
    } else {
      prompt('Скопируйте ссылку для друга:', link);
    }
  },

  async syncState(stateJson) {
    try {
      localStorage.setItem(CFG.SAVE_KEY, stateJson);
    } catch (e) {}
  },

  async loadState() {
    try {
      const data = localStorage.getItem(CFG.SAVE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  clear() {
    try {
      localStorage.removeItem(CFG.SAVE_KEY);
    } catch (e) {}
  }
};
