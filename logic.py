import logging
import re
import nltk
from typing import Dict, Any
from flask import Flask, request, jsonify
from flask_cors import CORS
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler("privacy_analysis.log"), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Ensure NLTK punkt_tab is downloaded
try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    logger.info("Downloading NLTK punkt_tab resource...")
    nltk.download('punkt_tab')

# Step 1: Define Constants
CATEGORIES = {
    "Collect Personal Information": {"keywords": ["collect", "gather", "store", "personal information", "name", "email", "phone number", "address", "location", "age", "gender", "payment", "profile"], "description": "Collect data subjects’ information."},
    "Data Retention Period": {"keywords": ["retain", "retention", "period", "keep", "store", "duration"], "description": "Retention period of personal information."},
    "Data Processing Purposes": {"keywords": ["purpose", "process", "processing", "use", "marketing", "analytics", "share", "third-party", "sell", "advertising", "personalized"], "description": "Purposes of processing personal data."},
    "Contact Details": {"keywords": ["contact", "controller", "data protection officer", "email", "phone", "address"], "description": "Contact details of the controller."},
    "Right to Access": {"keywords": ["right to access", "access", "request", "view", "see", "personal information", "manage", "my account"], "description": "Right to access personal information."},
    "Right to Rectify or Erase": {"keywords": ["right to rectify", "right to erase", "rectify", "erase", "delete", "correct", "update"], "description": "Right to rectify or erase personal information."},
    "Right to Restrict of Processing": {"keywords": ["right to restrict", "restrict", "limit", "processing"], "description": "Right to restrict processing."},
    "Right to Object to Processing": {"keywords": ["right to object", "object", "opt-out", "processing", "preferences", "cookies"], "description": "Right to object to processing."},
    "Right to Data Portability": {"keywords": ["right to data portability", "portability", "transmit", "transfer", "receive", "copies"], "description": "Right to data portability."},
    "Right to Lodge a Complaint": {"keywords": ["right to lodge", "lodge", "complaint", "supervisory authority", "grievance"], "description": "Right to lodge a complaint."},
    "Data Security": {"keywords": ["encrypt", "encryption", "secure", "protect", "cannot access", "firewalls", "safeguards"], "description": "Measures to secure personal data."},
    "Policy Metadata": {"keywords": ["update", "effective", "terms", "acceptance", "version", "date"], "description": "Information about policy updates."}
}

RED_FLAGS = {
    "Excessive Data Collection": {"keywords": ["location", "biometrics", "health"], "negative_keywords": ["necessary", "consent", "not track", "do not access"], "explanation": "They’re collecting sensitive info like your location.", "action": "Consider limiting location sharing or using a VPN."},
    "Indefinite Retention": {"keywords": ["permanent", "indefinite", "forever"], "negative_keywords": ["delete", "remove", "temporary", "not kept"], "explanation": "Your data might be kept forever.", "action": "Request data erasure if no longer needed."},
    "Unencrypted Data": {"keywords": ["store", "collect", "payment"], "negative_keywords": ["encrypt", "encryption", "secure", "safeguards"], "explanation": "Your data isn’t locked securely.", "action": "Verify security measures with support."},
    "Broad Third-Party Sharing": {"keywords": ["third-party", "share", "shared", "sell"], "negative_keywords": ["safeguards", "contract", "encrypted", "necessary"], "explanation": "Your info might be shared with third parties without clear rules.", "action": "Use a temporary email to reduce personal data exposure."},
    "Vague Language": {"keywords": ["may", "as needed", "whenever"], "negative_keywords": ["specific", "defined", "clearly"], "explanation": "The policy is unclear about data use.", "action": "Seek clarification via support email before proceeding."},
    "No User Control": {"keywords": ["process", "collect", "use"], "negative_keywords": ["opt-out", "consent", "settings", "control"], "explanation": "You can’t easily stop them from using your data.", "action": "Opt out via device settings or cancel subscription if controls are insufficient."},
    "Invasive Tracking": {"keywords": ["advertising", "profiling", "analytics", "direct marketing"], "negative_keywords": ["anonymous", "consent", "not retained"], "explanation": "They might track you for ads.", "action": "Disable interest-based ads in your device settings."},
    "Missing GDPR Rights": {"keywords": ["data", "use", "collect"], "negative_keywords": ["access", "delete", "portability", "object", "lodge", "restrict"], "explanation": "You might not have full control over your data rights.", "action": "Contact support to confirm your rights."}
}

# Step 2: Analyze Policy
def analyze_policy(policy_text: str) -> Dict:
    # Preprocess to remove HTML tags
    policy_text = re.sub(r'<[^>]+>', '', policy_text)  # Remove all HTML tags
    policy_text = re.sub(r'\s+', ' ', policy_text).strip()  # Normalize whitespace

    # Tokenize sentences
    sentences = nltk.sent_tokenize(policy_text)

    # Initialize results
    classifications = {cat: [] for cat in CATEGORIES}
    red_flags = {}
    rights_detected = any(any(kw.lower() in policy_text.lower() for kw in CATEGORIES[c]["keywords"]) 
                         for c in ["Right to Access", "Right to Rectify or Erase", "Right to Data Portability",
                                   "Right to Object to Processing", "Right to Lodge a Complaint"])

    # Category assignment
    for sentence in sentences:
        sentence_lower = sentence.lower()
        matched_category = None
        for category, details in CATEGORIES.items():
            if any(kw.lower() in sentence_lower for kw in details["keywords"]):
                matched_category = category
                classifications[category].append(sentence)
                break

    # Red flag detection
    for sentence in sentences:
        sentence_lower = sentence.lower()
        for flag, details in RED_FLAGS.items():
            if any(kw.lower() in sentence_lower for kw in details["keywords"]):
                neg_keywords_present = any(nk.lower() in sentence_lower for nk in details["negative_keywords"])
                if not neg_keywords_present:
                    if flag == "Invasive Tracking" and "not retained" in sentence_lower:
                        continue
                    if flag == "Excessive Data Collection" and ("not track" in sentence_lower or "do not access" in sentence_lower):
                        continue
                    if flag == "Indefinite Retention" and ("temporary" in sentence_lower or "not kept" in sentence_lower):
                        continue
                    if flag == "Unencrypted Data" and ("encrypt" in sentence_lower or "secure" in policy_text.lower()):
                        continue
                    if flag == "No User Control" and ("opt-out" in sentence_lower or "settings" in sentence_lower):
                        continue
                    if flag == "Broad Third-Party Sharing" and ("safeguards" in sentence_lower or "necessary" in sentence_lower):
                        continue
                    if flag == "Vague Language" and ("specific" in sentence_lower or "defined" in sentence_lower):
                        continue
                    if flag == "Missing GDPR Rights" and rights_detected:
                        continue
                    red_flags[flag] = {"evidence": sentence, "action": details["action"], "explanation": details["explanation"]}

    # Calculate risk score
    risk_score = 0.0
    unique_flags = set(red_flags.keys())
    for flag in unique_flags:
        if flag == "Broad Third-Party Sharing" and not any(nk.lower() in policy_text.lower() for nk in ["safeguards", "contract", "encrypted"]):
            risk_score += 2.0
        elif flag == "Excessive Data Collection":
            risk_score += 1.5
        elif flag in ["Invasive Tracking", "No User Control"]:
            risk_score += 1.0
        elif flag == "Vague Language":
            risk_score += 0.5
    if "third-party" in policy_text.lower() and not any(nk.lower() in policy_text.lower() for nk in ["safeguards", "contract", "encrypted"]):
        risk_score = max(risk_score, 2.0)
    if "location" in policy_text.lower() and not "not track" in policy_text.lower():
        risk_score = max(risk_score, 1.5)
    if "ads" in policy_text.lower() and not "anonymous" in policy_text.lower():
        risk_score = max(risk_score, 1.0)
    risk_score = min(risk_score, 5.0)

    # Data usage
    collected_data = set()
    processing_purposes = set()
    for sentence in sentences:
        sentence_lower = sentence.lower()
        if any(entity in sentence_lower for entity in ["email", "name", "phone", "address", "location", "age", "gender", "payment", "profile"]):
            collected_data.update(entity for entity in ["email", "name", "phone", "address", "location", "age", "gender", "payment", "profile"] if entity in sentence_lower)
        if any(purpose in sentence_lower for purpose in ["marketing", "third-party", "advertising", "personalized"]):
            processing_purposes.update(purpose for purpose in ["marketing", "third-party sharing", "advertising", "personalized"] if purpose.replace("third-party sharing", "third-party") in sentence_lower)

    return {
        "classifications": classifications,
        "red_flags": red_flags,
        "risk_score": risk_score,
        "collected_data": collected_data,
        "processing_purposes": processing_purposes
    }

# Step 3: Format Output as JSON
def format_output(analysis: Dict) -> Dict:
    risk_score = analysis["risk_score"]
    risk_level = "Low" if risk_score < 2 else "Medium" if risk_score < 4 else "High"

    report = {
        "summary": {
            "risk_level": risk_level,
            "score": f"{risk_score:.1f}/5",
            "recommendation": "Acceptable" if risk_score < 3 else "Consider using a temporary email or reviewing terms" if risk_score < 4 else "Highly risky; avoid or use with caution"
        },
        "red_flags": [
            {
                "explanation": RED_FLAGS[flag]["explanation"],
                "evidence": details["evidence"],
                "action": details["action"]
            } for flag, details in analysis["red_flags"].items()
        ],
        "categories_met": {
            cat: sents[0] for cat, sents in analysis["classifications"].items() if sents
        },
        "data_usage_overview": {
            "collected_data": ", ".join(sorted(analysis["collected_data"])) if analysis["collected_data"] else None,
            "processing_purposes": ", ".join(sorted(analysis["processing_purposes"])) if analysis["processing_purposes"] else None
        }
    }
    return report

# Step 4: Flask App with API Key
app = Flask(__name__)
CORS(app)

API_KEY = os.environ.get('PRIVACY_API_KEY', 'your-default-api-key')  # Set via Heroku config vars

@app.route('/analyze', methods=['POST'])
def analyze_policy_endpoint():
    data = request.get_json()
    if not data or 'policy_text' not in data or 'api_key' not in data:
        return jsonify({"error": "Missing policy_text or api_key"}), 400
    if data['api_key'] != API_KEY:
        return jsonify({"error": "Invalid API key"}), 403
    policy_text = data['policy_text']
    logger.info("Received policy text for analysis, length: %d", len(policy_text))
    analysis = analyze_policy(policy_text)
    report = format_output(analysis)
    logger.info("Analysis complete, risk score: %.1f", analysis["risk_score"])
    return jsonify(report)

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))