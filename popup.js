console.log("[popup.js] Popup loaded.");

const statusEl = document.getElementById('status');
const policyUrlBoxEl = document.getElementById('policyUrlBox');
const safetyCircleEl = document.getElementById('safetyCircle');
const riskInfoEl = document.getElementById('riskInfo');
const dataOverviewEl = document.getElementById('dataOverview');
const redFlagsListEl = document.getElementById('redFlagsList');
const userTipsListEl = document.getElementById('userTipsList');
const detailedSummaryEl = document.getElementById('detailedSummary');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const overviewContent = document.getElementById('overview-content');

// Show Overview tab by default on load
document.getElementById('overview-tab').style.display = 'block';
document.querySelector('[data-tab="overview"]').classList.add('active');

// Function to convert score to user-friendly risk level
function getRiskLevel(score) {
  const numericScore = parseFloat(score.split('/')[0]);
  if (numericScore <= 1) return "Low Risk";
  if (numericScore <= 3) return "Moderate Risk";
  return "High Risk";
}

// Enhanced sanitization function
function sanitizeText(text) {
  if (!text) return 'None';
  return text
    .replace(/[^\x20-\x7E\u00A0-\uD7FF\uE000-\uFFFD]/g, ' ')
    .replace(/&[#\w]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let storedAnalysis = null;

function updateContent(analysis) {
  console.log("[popup.js] Updating content with analysis:", analysis);
  storedAnalysis = analysis;
  if (analysis) {
    const score = parseFloat(analysis.summary.score.split('/')[0]);
    const safetyPercentage = Math.max(0, Math.min(100, 100 - (score / 5) * 100));
    safetyCircleEl.textContent = `${safetyPercentage}% Safe`;
    safetyCircleEl.className = safetyPercentage >= 60 ? 'safe-circle' : 'risk-circle';
    riskInfoEl.textContent = `Risk Level: ${getRiskLevel(analysis.summary.score)}`;
    dataOverviewEl.innerHTML = `
      <h4>Data Overview</h4>
      <p><span class="icon">📋</span> <strong>Collected:</strong> ${sanitizeText(analysis.data_usage_overview.collected_data)}</p>
      <p><span class="icon">🔧</span> <strong>Used For:</strong> ${sanitizeText(analysis.data_usage_overview.processing_purposes)}</p>
    `;

    redFlagsListEl.innerHTML = analysis.red_flags.length > 0
      ? analysis.red_flags.map(flag => `
        <div class="red-flag-item">
          <h5><span class="icon">⚠️</span> <strong>${sanitizeText(flag.explanation)}</strong></h5>
          <p class="evidence"><span class="icon">📄</span> Evidence: "${sanitizeText(flag.evidence)}"</p>
          <p class="action"><span class="icon">✅</span> Action: ${sanitizeText(flag.action)}</p>
        </div>
      `).join('')
      : '<p>No significant red flags detected.</p>';

    // Generate user tips based on analysis
    const tips = [];
    const riskLevel = getRiskLevel(analysis.summary.score);
    if (riskLevel === "High Risk") {
      tips.push("Avoid sharing sensitive data like payment or location information.");
      if (analysis.data_usage_overview.collected_data.includes("third-party sharing")) {
        tips.push("Use a temporary email to limit exposure to third-party tracking.");
      }
    } else if (riskLevel === "Moderate Risk") {
      tips.push("Review the policy periodically for updates.");
      if (analysis.data_usage_overview.collected_data) {
        tips.push(`Enable privacy settings to limit sharing of ${sanitizeText(analysis.data_usage_overview.collected_data)}.`);
      }
    } else {
      tips.push("Your data appears safe, but monitor for future policy changes.");
    }
    userTipsListEl.innerHTML = tips.length > 0
      ? tips.map(tip => `<p><span class="icon">💡</span> ${sanitizeText(tip)}</p>`).join('')
      : '<p>No specific tips at this time.</p>';

    // Display entire API response in user-readable format
    let detailedContent = '<div class="detailed-section">';
    for (let key in analysis) {
      if (analysis.hasOwnProperty(key)) {
        let value = analysis[key];
        // Handle nested objects
        if (typeof value === 'object' && value !== null) {
          detailedContent += `<h5>${sanitizeText(key)}</h5>`;
          for (let subKey in value) {
            if (value.hasOwnProperty(subKey)) {
              let subValue = value[subKey];
              if (typeof subValue === 'object' && subValue !== null) {
                detailedContent += `<p><strong>${sanitizeText(subKey)}:</strong> ${JSON.stringify(subValue)}</p>`;
              } else {
                detailedContent += `<p><strong>${sanitizeText(subKey)}:</strong> ${sanitizeText(subValue)}</p>`;
              }
            }
          }
        } else {
          detailedContent += `<h5>${sanitizeText(key)}</h5><p>${sanitizeText(value)}</p>`;
        }
      }
    }
    detailedContent += '</div>';
    detailedSummaryEl.innerHTML = detailedContent || '<p>No detailed analysis available.</p>';
  } else {
    dataOverviewEl.innerHTML = '<p>No data available.</p>';
    detailedSummaryEl.innerHTML = '<p>No detailed analysis available.</p>';
  }
}

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
    files: ["content.js"]
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
        statusEl.textContent = "Success";
        policyUrlBoxEl.innerHTML = `<h3>Privacy policy extracted from:</h3><div class="policy-url"><a href="${response.privacyPolicyUrl}" target="_blank">${response.privacyPolicyUrl}</a></div>`;
        storedAnalysis = response.policyContent;
        updateContent(storedAnalysis);
      } else {
        statusEl.textContent = "Privacy policy not found or error occurred.";
        if (response?.error) {
          console.error("[popup.js] Error details:", response.error);
          policyUrlBoxEl.innerHTML = `<h3>Privacy policy extracted from:</h3><div class="policy-url">Error: ${response.error}</div>`;
        } else {
          policyUrlBoxEl.innerHTML = `<h3>Privacy policy extracted from:</h3><div class="policy-url">Check console for details.</div>`;
        }
      }
    });
  });
});

// Smooth tab switching logic
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    tabButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    tabContents.forEach(content => content.style.display = 'none');
    const selectedTab = document.getElementById(`${button.dataset.tab}-tab`);
    selectedTab.style.display = 'block';

    if (button.dataset.tab === 'overview') {
      overviewContent.style.display = 'flex';
      riskInfoEl.style.display = 'block';
    } else {
      overviewContent.style.display = 'none';
      riskInfoEl.style.display = 'none';
    }
    updateContent(storedAnalysis);
  });
});

let response;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getPrivacyUrl') {
    response = msg;
    updateContent(response.policyContent);
  }
});