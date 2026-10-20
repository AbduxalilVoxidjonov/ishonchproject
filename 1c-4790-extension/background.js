// Fon skripti: 1C sahifasiga "haqiqiy" sichqoncha va klaviatura hodisalarini
// chrome.debugger (Chrome DevTools Protocol) orqali yuboradi.
// 1C web-klienti oddiy JS hodisalarini e'tiborsiz qoldirishi mumkin,
// shuning uchun bu yo'l eng ishonchlisi.

const attached = new Set();

function cdp(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (res) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(res);
    });
  });
}

async function attach(tabId) {
  if (attached.has(tabId)) return;
  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      const err = chrome.runtime.lastError;
      if (err && !/already attached/i.test(err.message)) reject(new Error(err.message));
      else resolve();
    });
  });
  attached.add(tabId);
}

async function detach(tabId) {
  if (!attached.has(tabId)) return;
  await new Promise((resolve) => chrome.debugger.detach({ tabId }, () => resolve()));
  attached.delete(tabId);
}

chrome.debugger.onDetach.addListener((src) => attached.delete(src.tabId));

const KEYS = {
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Tab: { code: "Tab", vk: 9 },
  Escape: { code: "Escape", vk: 27 },
  F9: { code: "F9", vk: 120 },
  F2: { code: "F2", vk: 113 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  Backspace: { code: "Backspace", vk: 8 },
  Delete: { code: "Delete", vk: 46 },
  a: { code: "KeyA", vk: 65 }
};

async function pressKey(tabId, key, modifiers = 0) {
  const k = KEYS[key];
  if (!k) throw new Error("Noma'lum tugma: " + key);
  const base = { key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers };
  const down = Object.assign({ type: k.text && !modifiers ? "keyDown" : "rawKeyDown" }, base);
  if (k.text && !modifiers) { down.text = k.text; down.unmodifiedText = k.text; }
  // macOS: Cmd+A klavish hodisasi o'zi belgilamaydi — tahrirlash buyrug'ini aniq beramiz.
  if (key === "a" && (modifiers & 4)) down.commands = ["selectAll"];
  await cdp(tabId, "Input.dispatchKeyEvent", down);
  await cdp(tabId, "Input.dispatchKeyEvent", Object.assign({ type: "keyUp" }, base));
}

async function typeText(tabId, text, delay = 0) {
  // Har bir belgini haqiqiy tugma kabi bosamiz (keydown + keypress + keyup):
  // 1C qidiruvi va raqam maydoni faqat shunday kiritishga javob beradi.
  for (const ch of text) {
    const up = ch.toUpperCase();
    let vk = 0, code = "";
    if (ch >= "0" && ch <= "9") { vk = ch.charCodeAt(0); code = "Digit" + ch; }
    else if (up >= "A" && up <= "Z" && up.length === 1) { vk = up.charCodeAt(0); code = "Key" + up; }
    else if (ch === " ") { vk = 32; code = "Space"; }
    else if (ch === ",") { vk = 188; code = "Comma"; }
    else if (ch === ".") { vk = 190; code = "Period"; }
    else if (ch === "-") { vk = 189; code = "Minus"; }
    const base = { key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await cdp(tabId, "Input.dispatchKeyEvent", Object.assign({ type: "keyDown", text: ch, unmodifiedText: ch }, base));
    await cdp(tabId, "Input.dispatchKeyEvent", Object.assign({ type: "keyUp" }, base));
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
}

async function click(tabId, x, y, count = 1) {
  for (let i = 1; i <= count; i++) {
    const p = { x, y, button: "left", clickCount: i };
    await cdp(tabId, "Input.dispatchMouseEvent", Object.assign({ type: "mouseMoved" }, p, { clickCount: 0 }));
    await cdp(tabId, "Input.dispatchMouseEvent", Object.assign({ type: "mousePressed" }, p));
    await cdp(tabId, "Input.dispatchMouseEvent", Object.assign({ type: "mouseReleased" }, p));
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (!tabId) { sendResponse({ ok: false, error: "Tab topilmadi" }); return; }
  (async () => {
    switch (msg.cmd) {
      case "attach": await attach(tabId); break;
      case "detach": await detach(tabId); break;
      case "click": await attach(tabId); await click(tabId, msg.x, msg.y, msg.count || 1); break;
      case "key": await attach(tabId); await pressKey(tabId, msg.key, msg.modifiers || 0); break;
      case "type": await attach(tabId); await typeText(tabId, msg.text, msg.delay || 0); break;
      case "insert": await attach(tabId); await cdp(tabId, "Input.insertText", { text: msg.text }); break;
      default: throw new Error("Noma'lum buyruq: " + msg.cmd);
    }
  })().then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: e.message }));
  return true;
});

// Extension ikonkasi bosilganda panelni ochish/yopish.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { cmd: "togglePanel" });
  } catch (e) {
    // Sahifa extension o'rnatilishidan/yangilanishidan oldin ochilgan — skriptni hozir yuklaymiz.
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["panel.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tab.id, { cmd: "togglePanel" });
    } catch (e2) { console.warn("4790: panelni ochib bo'lmadi:", e2 && e2.message); }
  }
});
