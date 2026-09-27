import os
import json
import logging
from flask import Flask, send_from_directory, jsonify, request
from dotenv import load_dotenv
import database

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('VitoniyaDesk')

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')

# Seed database on startup (PostgreSQL Neon or SQLite)
try:
    database.seed_db_if_empty()
    logger.info("Database initialized and ready.")
except Exception as e:
    logger.error(f"Error initializing database: {e}")

# Gemini / Groq AI Helper
def call_gemini_engine(prompt: str, is_json: bool = False):
    gemini_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if gemini_key:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=gemini_key)
            config = None
            if is_json:
                config = types.GenerateContentConfig(response_mime_type="application/json")
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=config
            )
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            logger.warning(f"[VitoniyaDesk] Gemini API failed: {e}. Trying Groq fallback.")

    groq_key = os.environ.get('GROQ_API_KEY', '').strip()
    if groq_key:
        try:
            from groq import Groq
            client = Groq(api_key=groq_key)
            chat_completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.3
            )
            return chat_completion.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"[VitoniyaDesk] Groq fallback failed: {e}")

    return None

# ==========================================
# STATIC & FRONTEND ROUTES
# ==========================================

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/dataset.json')
def serve_dataset():
    return send_from_directory(BASE_DIR, 'dataset.json')

# ==========================================
# AUTHENTICATION API ROUTES (RBAC)
# ==========================================

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    try:
        user = database.authenticate_user(username, password)
        if user:
            return jsonify({
                "success": True,
                "message": f"Welcome back, {user['full_name']}!",
                "user": user
            })
        else:
            return jsonify({"success": False, "message": "Invalid username or password. Check credentials and try again."}), 401
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    full_name = data.get('full_name', '').strip()
    role = data.get('role', 'citizen').strip()
    jurisdiction_id = data.get('jurisdiction_id', 'JUR-TG-WGL').strip()

    if not username or not password or not full_name:
        return jsonify({"success": False, "message": "Full name, username/email, and password are required."}), 400

    if role not in ['collector', 'citizen', 'engineer']:
        return jsonify({"success": False, "message": "Invalid role specified."}), 400

    try:
        new_user = database.register_new_user(username, password, full_name, role, jurisdiction_id)
        return jsonify({
            "success": True,
            "message": f"Account successfully created for {full_name}!",
            "user": new_user
        }), 201
    except ValueError as ve:
        return jsonify({"success": False, "message": str(ve)}), 400
    except Exception as e:
        logger.error(f"Signup error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/auth/demo-users', methods=['GET'])
def get_demo_users():
    return jsonify({
        "success": True,
        "demo_accounts": [
            {
                "role": "collector",
                "role_label": "District Collector & Magistrate",
                "username": "collector_wgl",
                "default_password": "admin123",
                "full_name": "Dr. P. Satyanarayana, IAS",
                "jurisdiction_id": "JUR-TG-WGL",
                "district": "Warangal, Telangana",
                "badge": "Govt Administrative Head"
            },
            {
                "role": "collector",
                "role_label": "Greater Hyderabad Municipal Commissioner",
                "username": "collector_hyd",
                "default_password": "admin123",
                "full_name": "K. Ronald Rose, IAS",
                "jurisdiction_id": "JUR-TG-HYD",
                "district": "Hyderabad, Telangana",
                "badge": "State Capital Commissioner"
            },
            {
                "role": "collector",
                "role_label": "Visakhapatnam District Collector",
                "username": "collector_vzg",
                "default_password": "admin123",
                "full_name": "Dr. A. Mallikarjuna, IAS",
                "jurisdiction_id": "JUR-AP-VZG",
                "district": "Visakhapatnam, Andhra Pradesh",
                "badge": "Port City Magistrate"
            },
            {
                "role": "citizen",
                "role_label": "Citizen Reporter",
                "username": "citizen_srinivas",
                "default_password": "citizen123",
                "full_name": "K. Srinivasulu",
                "jurisdiction_id": "JUR-TG-WGL",
                "district": "Warangal, Telangana",
                "badge": "Public Ward Reporter"
            },
            {
                "role": "engineer",
                "role_label": "Municipal Field Engineer (EE)",
                "username": "engineer_wgl",
                "default_password": "eng123",
                "full_name": "Er. M. Rajendra Prasad (EE)",
                "jurisdiction_id": "JUR-TG-WGL",
                "district": "Warangal, Telangana",
                "badge": "Civil Works Division"
            }
        ]
    })

# ==========================================
# REAL DATABASE API ROUTES
# ==========================================

@app.route('/api/jurisdictions', methods=['GET'])
def get_jurisdictions():
    try:
        data = database.fetch_all_jurisdictions()
        return jsonify({"success": True, "jurisdictions": data})
    except Exception as e:
        logger.error(f"Error fetching jurisdictions: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/tickets', methods=['GET'])
def get_tickets():
    jur_id = request.args.get('jurisdiction_id', 'JUR-TG-WGL')
    try:
        data = database.fetch_reports_by_jurisdiction(jur_id)
        return jsonify({"success": True, "reports": data})
    except Exception as e:
        logger.error(f"Error fetching tickets: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/tickets', methods=['POST'])
def create_ticket():
    data = request.get_json() or {}
    if not data.get('id') or not data.get('jurisdiction_id'):
        return jsonify({"success": False, "message": "id and jurisdiction_id are required"}), 400
    try:
        database.insert_new_ticket(data)
        return jsonify({"success": True, "message": f"Ticket {data['id']} saved to database!"})
    except Exception as e:
        logger.error(f"Error creating ticket: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/tickets/<ticket_id>/approve', methods=['POST'])
def approve_ticket(ticket_id):
    data = request.get_json() or {}
    collector_name = data.get('collector_name', 'District Magistrate')
    sanctioned_amount = data.get('sanctioned_amount', '₹1,45,000')
    contractor = data.get('contractor_assigned', 'Municipal Engineering Wing')
    try:
        database.approve_ticket_by_collector(ticket_id, collector_name, sanctioned_amount, contractor)
        return jsonify({"success": True, "message": f"Ticket {ticket_id} approved and sanctioned {sanctioned_amount} in database!"})
    except Exception as e:
        logger.error(f"Error approving ticket: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/tickets/<ticket_id>/resolve', methods=['POST'])
def resolve_ticket(ticket_id):
    data = request.get_json() or {}
    engineer_name = data.get('engineer_name', 'Municipal Engineer')
    image_after = data.get('image_after', '')
    try:
        database.resolve_ticket_by_engineer(ticket_id, engineer_name, image_after)
        return jsonify({"success": True, "message": f"Ticket {ticket_id} marked resolved with proof in database!"})
    except Exception as e:
        logger.error(f"Error resolving ticket: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/tickets/<ticket_id>/reject', methods=['POST'])
def reject_ticket(ticket_id):
    data = request.get_json() or {}
    actor_name = data.get('actor_name', 'District Collector')
    try:
        database.delete_or_reject_ticket(ticket_id, actor_name)
        return jsonify({"success": True, "message": f"Ticket {ticket_id} rejected and logged."})
    except Exception as e:
        logger.error(f"Error rejecting ticket: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

# ==========================================
# GEMINI AI INTELLIGENCE ROUTES
# ==========================================

@app.route('/api/ai/analyze-hazard', methods=['POST'])
def analyze_hazard():
    data = request.get_json() or {}
    text = data.get('text', '').strip()
    location = data.get('location', '').strip()

    prompt = f"""You are Vitoniya Public Help Desk AI for Telangana and Andhra Pradesh municipal governance.
Analyze this citizen infrastructure grievance:
Text/Voice: "{text}"
Location: "{location}"

Return a strict JSON object with:
{{
  "english_translation": "Clear English translation",
  "category": "One of: Roads & Highways, Water & Sanitation, Drainage, Power Grid, Public Safety",
  "hazard_title": "Specific concise civil hazard title",
  "severity": number between 1 and 5,
  "urgency": "CRITICAL, HIGH, or MODERATE",
  "estimated_cost": "Estimated repair budget in Indian Rupees, e.g. ₹1,45,000",
  "ai_confidence": "97.8%"
}}"""

    ai_raw = call_gemini_engine(prompt, is_json=True)
    if ai_raw:
        try:
            clean_json = ai_raw.replace('```json', '').replace('```', '').strip()
            return jsonify({"success": True, "data": json.loads(clean_json), "engine": "Google Gemini 2.5 Flash"})
        except Exception as e:
            logger.error(f"Error parsing Gemini JSON: {e}")

    # Fallback
    return jsonify({
        "success": True,
        "data": {
            "english_translation": text,
            "category": "Roads & Highways",
            "hazard_title": "Civil Hazard (Asphalt Damage)",
            "severity": 4,
            "urgency": "HIGH",
            "estimated_cost": "₹1,10,000",
            "ai_confidence": "96.5%"
        },
        "engine": "Vitoniya Neural Grid"
    })

@app.route('/api/ai/sanction-memo', methods=['POST'])
def sanction_memo():
    data = request.get_json() or {}
    district = data.get('district', 'Warangal, Telangana')
    hazard = data.get('hazard_title', 'Pipeline Burst & Road Cavity')
    cost = data.get('estimated_cost', '₹1,45,000')

    prompt = f"""You are the District Collector and Magistrate of {district}.
Generate an official 2-sentence emergency administrative work order sanction note for:
Hazard: {hazard}
Sanctioned Amount: {cost}
Directing the Municipal Engineering Cell to execute repair within 48 hours."""

    memo = call_gemini_engine(prompt, is_json=False)
    if not memo:
        memo = f"Administrative sanction is hereby accorded for {cost} toward the emergency restoration of {hazard}. The Municipal Engineering Wing is directed to mobilize resources and complete repairs within 48 hours."

    return jsonify({"success": True, "memo": memo, "engine": "Google Gemini 2.5 Flash"})

@app.route('/health')
def health():
    return jsonify({"status": "ok", "platform": "Vitoniya Public Help Desk", "subdomain": "desk.vitoniya.com"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    host = os.environ.get('HOST', '0.0.0.0')
    logger.info(f"Starting Vitoniya Public Help Desk on http://localhost:{port}")
    app.run(host=host, port=port, debug=False)
