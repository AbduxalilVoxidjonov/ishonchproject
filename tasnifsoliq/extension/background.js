// toolbar icon opens the side panel next to the current page
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Cross-extension bridge for the 1C receipt extension. The 1C extension only
// receives a verdict; the logged-in my.soliq.uz tab remains controlled here by
// the MXIK extension's own content script.
const MARK_URL = "https://my.soliq.uz/remotes-services/markirovka/product_markirovka";
const cleanCode = value => String(value == null ? "" : value).replace(/[\x00-\x1f\x1d\s]/g, "");
const cleanStir = value => String(value == null ? "" : value).replace(/\D/g, "");
const isWholesale = op => /ulgurji|улгуржи|оптов/i.test(String(op || ""));
// Sellable only while the code sits in wholesale with us: the last operation is
// wholesale and, when our STIR is given, its STIR (the last receiver) is ours.
const verdictOf = (last, stir) => {
  if (!last) return "unknown";
  const ours = cleanStir(stir);
  if (ours && cleanStir(last.stir) !== ours) return "sold";
  if (isWholesale(last.operation)) return "available";
  if (/chakana|чакана|розн/i.test(String(last.operation || ""))) return "sold";
  return "unknown";
};

// The 1C tab is in front while it asks, so the my.soliq.uz tab works in the background: Memory
// Saver may have discarded it (no content script answers) and must not discard it mid-check.
async function prepareMarkTab(tab) {
  await chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
  if (tab.discarded) {
    await chrome.tabs.reload(tab.id);
    await new Promise(resolve => setTimeout(resolve, 1500));
  } else if (!tab.url || !tab.url.startsWith(MARK_URL)) {
    await chrome.tabs.update(tab.id, { url: MARK_URL });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return tab;
}

async function checkMarkingCode(code, stir) {
  const value = cleanCode(code);
  if (!value) throw new Error("Markirovka kodi bo'sh");
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: "https://my.soliq.uz/*" });
  if (!tab) [tab] = await chrome.tabs.query({ url: MARK_URL + "*" });
  if (!tab) tab = await chrome.tabs.create({ url: MARK_URL, active: false });
  tab = await prepareMarkTab(tab);
  for (let i = 0; i < 40; i++) {
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: "mxik-search", code: value });
      if (result) {
        if (result.loggedIn === false) return { verdict: "unknown", reason: "my.soliq.uz ga kirilmagan" };
        const history = result.history;
        // Never reuse a previous search result.  The site can render the
        // previous product while a new code is not found; only an exact code
        // match with at least one history step is eligible for a verdict.
        if (!result.found || !history || cleanCode(history.code) !== value || !Array.isArray(history.steps) || !history.steps.length) {
          return { verdict: "unknown", reason: result.reason || "markirovka topilmadi", history: null };
        }
        const last = history.last;
        const ours = cleanStir(stir);
        return { verdict: verdictOf(last, ours), operation: last?.operation || "", lastStir: last?.stir || "",
          stir: ours, stirMatch: ours ? cleanStir(last?.stir) === ours : null, history };
      }
    } catch (_) {
      // Content script may still be loading after the tab was opened.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("my.soliq.uz sahifasi javob bermadi");
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "mxik-check-marking") return false;
  checkMarkingCode(message.code, message.stir)
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(error => sendResponse({ ok: false, verdict: "unknown", error: String(error?.message || error) }));
  return true;
});

// Timers of a background tab are throttled (down to once a minute); the service worker's are not,
// so the my.soliq.uz content script waits through here
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "mxik-sleep" || !sender.tab) return false;
  setTimeout(() => sendResponse(true), Math.max(0, Math.min(message.ms || 0, 10000)));
  return true;
});
