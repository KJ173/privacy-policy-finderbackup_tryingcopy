console.log("[popup.js] Popup loaded.");

const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const contentEl = document.getElementById('policyContent');
const toggleButton = document.getElementById('toggleContent');

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url || !tab.url.startsWith("http")) {
    console.log("[popup.js] Invalid tab or URL.");
    statusEl.textContent = "Not a valid web page.";
    return;
  }

  console.log("[popup.js] Injecting content script into:", tab.url);

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.97bb45a0.js"]
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("[popup.js] Script injection error:", chrome.runtime.lastError.message);
      statusEl.textContent = "Failed to inject content script.";
      return;
    }

    console.log("[popup.js] Sending message to content script.");
    chrome.tabs.sendMessage(tab.id, { action: 'getPrivacyUrl' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[popup.js] Messaging error:", chrome.runtime.lastError.message);
        statusEl.textContent = "No response from content script.";
        return;
      }

      console.log("[popup.js] Received response from content script:", response);
      if (response?.status === 'success') {
        statusEl.textContent = "Success:";
        resultEl.innerHTML = `<a href="${response.privacyPolicyUrl}" target="_blank">${response.privacyPolicyUrl}</a>`;

        const analysis = response.policyContent;
        if (analysis) {
          let displayText = `Risk Level: ${analysis.summary.risk_level} (Score: ${analysis.summary.score})\n`;
          displayText += `Recommendation: ${analysis.summary.recommendation}\n\n`;
          if (analysis.red_flags.length > 0) {
            displayText += "Red Flags:\n";
            analysis.red_flags.forEach(flag => {
              displayText += `- ${flag.explanation}\n  Evidence: "${flag.evidence}"\n  Action: ${flag.action}\n\n`;
            });
          } else {
            displayText += "No significant red flags detected.\n";
          }
          if (Object.keys(analysis.categories_met).length > 0) {
            displayText += "Categories Met:\n";
            Object.entries(analysis.categories_met).forEach(([cat, sent]) => {
              displayText += `- ${cat}: ${sent}\n`;
            });
          }
          if (analysis.data_usage_overview.collected_data || analysis.data_usage_overview.processing_purposes) {
            displayText += "Data Usage Overview:\n";
            if (analysis.data_usage_overview.collected_data) {
              displayText += `- Collects: ${analysis.data_usage_overview.collected_data}\n`;
            }
            if (analysis.data_usage_overview.processing_purposes) {
              displayText += `- May use for: ${analysis.data_usage_overview.processing_purposes}\n`;
            }
          }

          contentEl.textContent = displayText;
          contentEl.classList.add('show');
          toggleButton.style.display = 'block';
        } else {
          contentEl.textContent = "No analysis available.";
          contentEl.classList.add('show');
          toggleButton.style.display = 'none';
        }

        toggleButton.addEventListener('click', () => {
          if (contentEl.classList.contains('expanded')) {
            contentEl.classList.remove('expanded');
            toggleButton.textContent = 'Show Full Policy';
          } else {
            contentEl.classList.add('expanded');
            toggleButton.textContent = 'Hide Full Policy';
          }
        });
      } else {
        statusEl.textContent = "Privacy policy not found or error occurred.";
        if (response?.error) {
          console.error("[popup.js] Error details:", response.error);
          resultEl.textContent = `Error: ${response.error}`;
        } else {
          resultEl.textContent = "Check console for details.";
        }
        contentEl.classList.remove('show');
        toggleButton.style.display = 'none';
      }
    });
  });
});