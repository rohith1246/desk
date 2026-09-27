import os
import json
import logging
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger('VitoniyaDeskDB')
DB_PATH = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'vitoniya_desk.db')
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()

# Try to determine if PostgreSQL or SQLite
USE_POSTGRES = bool(DATABASE_URL and DATABASE_URL.startswith(('postgres://', 'postgresql://')))

def get_connection():
    if USE_POSTGRES:
        try:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
            return conn, 'postgres'
        except Exception as e:
            logger.warning(f"PostgreSQL Neon connection failed ({e}). Falling back to SQLite.")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn, 'sqlite'

def init_db():
    conn, engine = get_connection()
    cursor = conn.cursor()

    if engine == 'postgres':
        # PostgreSQL Neon Schema
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS vdesk_jurisdictions (
            id VARCHAR(50) PRIMARY KEY,
            state VARCHAR(50) NOT NULL,
            district VARCHAR(100) NOT NULL,
            admin_body VARCHAR(255) NOT NULL,
            collector_name VARCHAR(255) NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            zoom INT DEFAULT 12,
            total_budget VARCHAR(50) DEFAULT '₹0.00'
        );
        CREATE TABLE IF NOT EXISTS vdesk_users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL,
            jurisdiction_id VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS vdesk_tickets (
            id VARCHAR(50) PRIMARY KEY,
            jurisdiction_id VARCHAR(50) NOT NULL,
            district VARCHAR(100) NOT NULL,
            state VARCHAR(50) NOT NULL,
            location TEXT NOT NULL,
            ward VARCHAR(100),
            pincode VARCHAR(20),
            lat DOUBLE PRECISION,
            lng DOUBLE PRECISION,
            citizen_name VARCHAR(255),
            citizen_phone VARCHAR(50),
            voice_transcript TEXT,
            english_translation TEXT,
            category VARCHAR(100),
            hazard_title VARCHAR(255),
            severity INT DEFAULT 3,
            urgency VARCHAR(50) DEFAULT 'MODERATE',
            ai_confidence VARCHAR(50),
            estimated_cost VARCHAR(50),
            status VARCHAR(100) DEFAULT 'Pending Collector Review',
            sanctioned_amount VARCHAR(50),
            contractor_assigned VARCHAR(255),
            image_before TEXT,
            image_after TEXT,
            upvotes INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS vdesk_audit_logs (
            id SERIAL PRIMARY KEY,
            ticket_id VARCHAR(50) NOT NULL,
            actor_name VARCHAR(255) NOT NULL,
            actor_role VARCHAR(50) NOT NULL,
            action_taken VARCHAR(100) NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ''')
    else:
        # SQLite Schema
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS vdesk_jurisdictions (
            id TEXT PRIMARY KEY,
            state TEXT NOT NULL,
            district TEXT NOT NULL,
            admin_body TEXT NOT NULL,
            collector_name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            zoom INTEGER DEFAULT 12,
            total_budget TEXT DEFAULT '₹0.00'
        );
        ''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS vdesk_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            jurisdiction_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS vdesk_tickets (
            id TEXT PRIMARY KEY,
            jurisdiction_id TEXT NOT NULL,
            district TEXT NOT NULL,
            state TEXT NOT NULL,
            location TEXT NOT NULL,
            ward TEXT,
            pincode TEXT,
            lat REAL,
            lng REAL,
            citizen_name TEXT,
            citizen_phone TEXT,
            voice_transcript TEXT,
            english_translation TEXT,
            category TEXT,
            hazard_title TEXT,
            severity INTEGER DEFAULT 3,
            urgency TEXT DEFAULT 'MODERATE',
            ai_confidence TEXT,
            estimated_cost TEXT,
            status TEXT DEFAULT 'Pending Collector Review',
            sanctioned_amount TEXT,
            contractor_assigned TEXT,
            image_before TEXT,
            image_after TEXT,
            upvotes INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ''')
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS vdesk_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL,
            actor_name TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            action_taken TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ''')

    conn.commit()
    conn.close()
    logger.info(f"Database initialized successfully on {engine.upper()}.")

def seed_db_if_empty():
    init_db()
    conn, engine = get_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) as cnt FROM vdesk_jurisdictions')
    res = cursor.fetchone()
    count = res['cnt'] if isinstance(res, dict) else res[0]

    if count == 0:
        logger.info(f"Seeding {engine.upper()} database with initial AP & TG jurisdictions and reports...")
        dataset_file = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'dataset.json')
        if os.path.exists(dataset_file):
            with open(dataset_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            ph = '%s' if engine == 'postgres' else '?'

            # Insert jurisdictions
            for j in data.get('jurisdictions', []):
                cursor.execute(f'''
                INSERT INTO vdesk_jurisdictions (id, state, district, admin_body, collector_name, lat, lng, zoom, total_budget)
                VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                ''', (j['id'], j['state'], j['district'], j['admin_body'], j['collector_name'], j['lat'], j['lng'], j.get('zoom', 12), j.get('total_budget', '₹0.00')))

            # Insert default RBAC demo users
            demo_users = [
                ('collector_wgl', 'admin123', 'Dr. P. Satyanarayana, IAS', 'collector', 'JUR-TG-WGL'),
                ('collector_hyd', 'admin123', 'K. Ronald Rose, IAS', 'collector', 'JUR-TG-HYD'),
                ('collector_vzg', 'admin123', 'Dr. A. Mallikarjuna, IAS', 'collector', 'JUR-AP-VZG'),
                ('engineer_wgl', 'eng123', 'Er. M. Rajendra Prasad (EE)', 'engineer', 'JUR-TG-WGL'),
                ('citizen_srinivas', 'citizen123', 'K. Srinivasulu', 'citizen', 'JUR-TG-WGL')
            ]
            for u, p, name, role, jur in demo_users:
                cursor.execute(f'''
                INSERT INTO vdesk_users (username, password_hash, full_name, role, jurisdiction_id)
                VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
                ''', (u, generate_password_hash(p), name, role, jur))

            # Insert initial tickets
            for r in data.get('reports', []):
                cursor.execute(f'''
                INSERT INTO vdesk_tickets (
                    id, jurisdiction_id, district, state, location, ward, pincode,
                    lat, lng, citizen_name, citizen_phone, voice_transcript,
                    english_translation, category, hazard_title, severity, urgency,
                    ai_confidence, estimated_cost, status, sanctioned_amount,
                    contractor_assigned, image_before, image_after, upvotes
                ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                ''', (
                    r['id'], r['jurisdiction_id'], r['district'], r['state'], r['location'],
                    r['ward'], r['pincode'], r['lat'], r['lng'], r['citizen_name'],
                    r['citizen_phone'], r['voice_transcript'], r['english_translation'],
                    r['category'], r['hazard_title'], r['severity'], r['urgency'],
                    r['ai_confidence'], r['estimated_cost'], r['status'], r.get('sanctioned_amount'),
                    r.get('contractor_assigned'), r['image_before'], r.get('image_after'), r.get('upvotes', 1)
                ))

            conn.commit()
            logger.info(f"{engine.upper()} successfully seeded with live records.")

    conn.close()

# Database Helper Functions
def fetch_all_jurisdictions():
    conn, engine = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM vdesk_jurisdictions ORDER BY state, district')
    rows = cursor.fetchall()
    conn.close()
    return [dict(ix) for ix in rows]

def fetch_reports_by_jurisdiction(jur_id):
    conn, engine = get_connection()
    cursor = conn.cursor()
    ph = '%s' if engine == 'postgres' else '?'
    cursor.execute(f'SELECT * FROM vdesk_tickets WHERE jurisdiction_id = {ph} ORDER BY created_at DESC', (jur_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(ix) for ix in rows]

def insert_new_ticket(ticket_data):
    conn, engine = get_connection()
    cursor = conn.cursor()
    ph = '%s' if engine == 'postgres' else '?'
    cursor.execute(f'''
    INSERT INTO vdesk_tickets (
        id, jurisdiction_id, district, state, location, ward, pincode,
        lat, lng, citizen_name, citizen_phone, voice_transcript,
        english_translation, category, hazard_title, severity, urgency,
        ai_confidence, estimated_cost, status, image_before, image_after, upvotes
    ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
    ''', (
        ticket_data['id'], ticket_data['jurisdiction_id'], ticket_data['district'],
        ticket_data['state'], ticket_data['location'], ticket_data.get('ward', 'Ward 1'),
        ticket_data.get('pincode', '506001'), ticket_data.get('lat', 17.9689), ticket_data.get('lng', 79.5941),
        ticket_data.get('citizen_name', 'Citizen'), ticket_data.get('citizen_phone', '+91 9•••• •••••'),
        ticket_data.get('voice_transcript', ''), ticket_data.get('english_translation', ''),
        ticket_data.get('category', 'Roads & Civil Infrastructure'),
        ticket_data.get('hazard_title', 'Citizen Reported Infrastructure Hazard'),
        ticket_data.get('severity', 4), ticket_data.get('urgency', 'HIGH'),
        ticket_data.get('ai_confidence', '96.5%'), ticket_data.get('estimated_cost', '₹1,20,000'),
        'Pending Collector Review', ticket_data.get('image_before', ''), None, 1
    ))
    conn.commit()
    conn.close()

def approve_ticket_by_collector(ticket_id, collector_name, sanctioned_amount, contractor):
    conn, engine = get_connection()
    cursor = conn.cursor()
    ph = '%s' if engine == 'postgres' else '?'
    cursor.execute(f'''
    UPDATE vdesk_tickets 
    SET status = 'Collector Approved & Sanctioned',
        sanctioned_amount = {ph},
        contractor_assigned = {ph}
    WHERE id = {ph}
    ''', (sanctioned_amount, contractor, ticket_id))

    cursor.execute(f'''
    INSERT INTO vdesk_audit_logs (ticket_id, actor_name, actor_role, action_taken, details)
    VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
    ''', (ticket_id, collector_name, 'collector', 'Sanctioned Work Order', f"Sanctioned {sanctioned_amount} to {contractor}"))

    conn.commit()
    conn.close()

def resolve_ticket_by_engineer(ticket_id, engineer_name, image_after):
    conn, engine = get_connection()
    cursor = conn.cursor()
    ph = '%s' if engine == 'postgres' else '?'
    cursor.execute(f'''
    UPDATE vdesk_tickets 
    SET status = 'Resolved with Proof',
        image_after = {ph}
    WHERE id = {ph}
    ''', (image_after, ticket_id))

    cursor.execute(f'''
    INSERT INTO vdesk_audit_logs (ticket_id, actor_name, actor_role, action_taken, details)
    VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
    ''', (ticket_id, engineer_name, 'engineer', 'Completed & Uploaded Proof', 'Marked 100% Repaired'))

    conn.commit()
    conn.close()

def delete_or_reject_ticket(ticket_id, actor_name):
    conn, engine = get_connection()
    cursor = conn.cursor()
    ph = '%s' if engine == 'postgres' else '?'
    cursor.execute(f'DELETE FROM vdesk_tickets WHERE id = {ph}', (ticket_id,))
    cursor.execute(f'''
    INSERT INTO vdesk_audit_logs (ticket_id, actor_name, actor_role, action_taken, details)
    VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
    ''', (ticket_id, actor_name, 'collector', 'Rejected / Deleted Ticket', 'Marked Spurious'))
    conn.commit()
    conn.close()

def authenticate_user(username_or_email, password):
    conn, engine = get_connection()
    cursor = conn.cursor()
    ph = '%s' if engine == 'postgres' else '?'
    clean_username = username_or_email.strip().lower()
    cursor.execute(f'SELECT * FROM vdesk_users WHERE LOWER(username) = {ph}', (clean_username,))
    user = cursor.fetchone()
    conn.close()
    if not user:
        return None
    user_dict = dict(user)
    if check_password_hash(user_dict['password_hash'], password):
        del user_dict['password_hash']
        return user_dict
    return None

def register_new_user(username, password, full_name, role, jurisdiction_id):
    conn, engine = get_connection()
    cursor = conn.cursor()
    ph = '%s' if engine == 'postgres' else '?'
    clean_username = username.strip().lower()
    cursor.execute(f'SELECT id FROM vdesk_users WHERE LOWER(username) = {ph}', (clean_username,))
    if cursor.fetchone():
        conn.close()
        raise ValueError(f"Username or email '{username}' is already registered.")

    hashed = generate_password_hash(password)
    cursor.execute(f'''
    INSERT INTO vdesk_users (username, password_hash, full_name, role, jurisdiction_id)
    VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
    ''', (clean_username, hashed, full_name.strip(), role.strip(), jurisdiction_id.strip()))
    conn.commit()

    cursor.execute(f'SELECT id, username, full_name, role, jurisdiction_id, created_at FROM vdesk_users WHERE LOWER(username) = {ph}', (clean_username,))
    new_user = dict(cursor.fetchone())
    conn.close()
    return new_user

def fetch_all_users():
    conn, engine = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, full_name, role, jurisdiction_id, created_at FROM vdesk_users ORDER BY id')
    users = [dict(u) for u in cursor.fetchall()]
    conn.close()
    return users

