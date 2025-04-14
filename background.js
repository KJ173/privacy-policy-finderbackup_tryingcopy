console.log("[background.js] Background script loaded.");

const PRIVACY_API_KEY = '7c9c03c2063d9e7eda61a2ecf452cd3e'; // Match the Render environment variable
const API_ENDPOINT = 'https://privacyscout.onrender.com/analyze'; // Replace with your Render URL

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchPrivacyPolicyContent') {
    console.log("[background.js] Received request to fetch privacy policy content for URL:", message.url);

    fetch(message.url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.text(); // Fetch text (assumed UTF-8 by default)
      })
      .then(htmlText => {
        console.log("[background.js] Raw HTML fetched, length:", htmlText.length);
        if (!htmlText) {
          console.error("[background.js] No HTML content received.");
          sendResponse({ status: 'error', error: 'No HTML content received' });
          return;
        }
        // Enhanced UTF-8 decoding with fallback
        const decodedText = new TextDecoder('utf-8', { fatal: false }).decode(new TextEncoder().encode(htmlText));
        // Sanitize HTML to remove potential encoding artifacts
        const sanitizedText = decodedText.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
        fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policy_text: sanitizedText, api_key: PRIVACY_API_KEY })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(analysis => {
          console.log("[background.js] Received analysis:", analysis);
          sendResponse({ status: 'success', analysis: analysis });
        })
        .catch(error => {
          console.error("[background.js] Error analyzing policy:", error.message);
          sendResponse({ status: 'error', error: `Failed to connect to server: ${error.message}` });
        });
        return true;
      })
      .catch(error => {
        console.error("[background.js] Error fetching privacy policy:", error.message);
        sendResponse({ status: 'error', error: `Fetch failed: ${error.message}` });
      });
    return true;
  }
});