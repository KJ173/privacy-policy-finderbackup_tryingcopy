console.log("[content.js] Content script loaded.");

const getRootDomain = (() => {
  let cached;
  return (url) => {
    if (cached && url === window.location.href) return cached;
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.split('.').slice(-2);
      cached = parts.join('.');
      return cached;
    } catch {
      return '';
    }
  };
})();

const tryFindAnyPrivacyLink = () => {
  console.log("[content.js] Checking for any visible privacy policy link...");

  const keywords = /privacy/i;
  const currentDomain = getRootDomain(window.location.href);

  const anchors = Array.from(document.querySelectorAll("a")).filter(a => {
    const href = a.getAttribute('href') || '';
    const text = a.innerText || '';
    const isVisible = !!(a.offsetWidth || a.offsetHeight || a.getClientRects().length);
    return (
      isVisible &&
      (href.startsWith("http") || href.startsWith("/")) &&
      (keywords.test(href) || keywords.test(text))
    );
  });

  if (anchors.length > 0) {
    const first = anchors[0];
    const resolvedHref = first.href.startsWith("http") ? first.href : new URL(first.getAttribute('href'), window.location.origin).href;
    console.log(`[content.js] Found ${anchors.length} candidate privacy links. Returning first one:`, resolvedHref);
    return resolvedHref;
  }

  console.log("[content.js] No direct privacy link found on page.");
  return null;
};

const fallbackFindPrivacyPolicyUrl = () => {
  console.log("[content.js] Using fallback pattern-based search...");

  const patterns = [
    /privacy-policy(\.html?|\.php|\.asp)?$/i,
    /\/privacy\/policy/i,
    /\/policy\/privacy/i,
    /privacy[-_]?statement/i,
    /privacy[-_]?notice/i,
    /privacy[-_]?policy[-_]?details/i,
    /about[-_]?privacy/i,
    /\/legal\/privacy/i,
    /\/about\/privacy/i,
    /\/info\/privacy/i,
    /\/privacy/i,
    /\/policies\/privacy/i,
    /\/privacy-policy[-_][a-z]+/i,
    /\/legal\/data[-_]?protection/i,
    /\/data[-_]?protection/i,
    /\/legal\/compliance/i,
    /\/compliance/i,
    /\/legal[-_]?notice/i,
    /\/terms[-_]?and[-_]?conditions/i,
    /\/terms[-_]?of[-_]?service/i,
    /\/terms/i,
    /\/disclaimer/i,
    /\/legal/i,
    /\/cookie[-_]?policy/i,
    /\/cookies/i,
    /\/gdpr/i,
    /\/security[-_]?policy/i,
    /\/info\/security/i,
    /\/privacy[-_]?settings/i,
    /\/settings\/privacy/i
  ];

  const currentDomain = getRootDomain(window.location.href);
  const anchors = Array.from(document.querySelectorAll("a"));

  const matches = anchors
    .map(anchor => {
      const url = anchor.href;
      const text = anchor.innerText.trim();
      const anchorDomain = getRootDomain(url);
      if (!url.startsWith("http") || anchorDomain !== currentDomain) return null;

      let score = Infinity;
      patterns.forEach((regex, index) => {
        if (regex.test(url) || regex.test(text)) {
          score = Math.min(score, index);
        }
      });

      return score < Infinity ? { url, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);

  const result = matches[0]?.url;
  console.log("[content.js] Fallback match result:", result);
  return result;
};

const smartFindPrivacyPolicyNearForm = () => {
  console.log("[content.js] Trying to find privacy policy near forms...");

  const keywords = /privacy/i;
  const formRelatedWords = /(sign\s?up|register|create\saccount|continue|join|get\sstarted|log\s?in|start\sfree)/i;

  const buttons = Array.from(document.querySelectorAll("button, input[type='submit']"))
    .filter(el => formRelatedWords.test(el.innerText || el.value || ''));

  for (const button of buttons) {
    let container = button.closest("form") || button.closest("div") || button.parentElement;
    if (!container) continue;

    const links = container.querySelectorAll("a");
    for (const link of links) {
      const text = link.innerText.toLowerCase();
      const href = link.href.toLowerCase();
      if (keywords.test(text) || keywords.test(href)) {
        console.log("[content.js] Found privacy link near form:", link.href);
        return link.href;
      }
    }
  }

  console.log("[content.js] No nearby privacy link found.");
  return null;
};

const findPrivacyPolicyUrl = () => {
  console.log("[content.js] Starting full privacy policy URL detection...");

  // Step 1: Look for obvious privacy link
  const directLink = tryFindAnyPrivacyLink();
  if (directLink) return directLink;

  // Step 2: Try form-proximity detection
  const formLink = smartFindPrivacyPolicyNearForm();
  if (formLink) return formLink;

  // Step 3: Fallback to pattern matching
  return fallbackFindPrivacyPolicyUrl();
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPrivacyUrl') {
    console.log("[content.js] Received 'getPrivacyUrl' request.");
    const privacyPolicyUrl = findPrivacyPolicyUrl();
    
    if (privacyPolicyUrl) {
      console.log("[content.js] Found privacy policy URL:", privacyPolicyUrl);
      chrome.runtime.sendMessage({
        action: 'fetchPrivacyPolicyContent',
        url: privacyPolicyUrl
      }, (response) => {
        if (response.status === 'success') {
          console.log("[content.js] Received analysis from background:", response.analysis);
          sendResponse({
            status: 'success',
            privacyPolicyUrl: privacyPolicyUrl,
            policyContent: response.analysis
          });
        } else {
          console.error("[content.js] Background script error:", response.error);
          sendResponse({
            status: 'error',
            privacyPolicyUrl: privacyPolicyUrl,
            policyContent: null,
            error: response.error
          });
        }
      });
    } else {
      console.log("[content.js] No privacy policy URL found.");
      sendResponse({
        status: 'error',
        privacyPolicyUrl: null,
        policyContent: null
      });
    }
    return true;
  }
});