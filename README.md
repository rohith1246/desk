# Vitoniya Public Help Desk 🏛️

> **Enterprise AI-Powered Civil Infrastructure & Municipal Governance Platform**  
> Subdomain Target: `desk.vitoniya.com` &bull; Built by **Vitoniya Global Technologies**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![PostgreSQL Neon](https://img.shields.io/badge/PostgreSQL-Neon_Cloud-00E599.svg?logo=postgresql&logoColor=white)](https://neon.tech)
[![AI Engine](https://img.shields.io/badge/Google-Gemini_2.5_Flash-4285F4.svg?logo=google&logoColor=white)](https://ai.google.dev)
[![State Coverage](https://img.shields.io/badge/Coverage-Telangana_&_Andhra_Pradesh-FF9933.svg)]()

---

## 📌 Executive Overview

In urban wards and rural mandals, critical infrastructure failures—such as burst water mains, collapsed asphalt culverts, or dangerous high-tension wires—frequently cause fatal accidents and public hardship while complaints languish in disconnected government files.

**Vitoniya Public Help Desk** is a next-generation Digital Public Infrastructure (DPI) platform designed for **Telangana (TG)** and **Andhra Pradesh (AP)** municipal administrations. It unifies citizen photo & voice grievances with **Google Gemini 2.5 Flash Multimodal AI**, spatial GIS heatmapping, and real-time Role-Based Access Control (RBAC) work order sanctioning.

---

## 🚀 Core Features

### 1. 🏛️ District Collector & Magistrate Command Desk (Govt Admin)
* **High-Resolution Photo Inspection:** Instant inspection modal with evidence zoom.
* **Gemini AI Civil Risk Assessment:** Automatic severity scoring (1–5), urgency level, and estimated repair budget.
* **1-Click Administrative Work Order Sanction:** Allocates municipal engineering budget and assigns local contractors in the live database.
* **Live GIS District Heatmap:** Leaflet.js geospatial mapping with color-coded ticket status pins (Pending, Sanctioned, Resolved).

### 2. 👤 Multilingual Citizen Reporter Portal
* **Voice Note Ingestion:** Tap-to-speak in **Telugu** or **English** with real-time browser speech recognition.
* **Google Gemini AI Translation & Analysis:** Translates regional Telugu grievances, classifies infrastructure category, detects hazard type, and calculates estimated repair costs.
* **Camera & Photo Evidence Upload:** Direct attachment of damage photos with client-side preview.
* **Tracking ID:** Real-time generation of jurisdiction tracking tokens (`VIT-WGL-XXXX`, `VIT-VZG-XXXX`).

### 3. 🛠️ Municipal Field Engineer Resolution Desk
* **Sanctioned Works Queue:** Real-time queue of collector-sanctioned emergency repairs.
* **After-Repair Proof Upload:** Field contractors attach completion photos directly from the field.
* **Status Automation:** Updates work orders to *100% Repaired & Verified*.

### 4. 📜 Public Transparency & Audit Ledger
* **Side-by-Side Verification:** Public display of **Before (Citizen Photo)** vs. **After (Completed Repair Photo)**.
* **Fiscal Accountability:** Permanent audit log of sanctioned amounts, completing engineers, and collector approvals.

---

## 🗺️ Supported AP & TG Jurisdictions

Vitoniya Public Help Desk supports real-time multi-district switching across Andhra Pradesh and Telangana:

| State | District | Administrative Body | District Magistrate |
| :--- | :--- | :--- | :--- |
| **Telangana** | **Warangal** | Warangal District Collectorate & GWMC | Dr. P. Satyanarayana, IAS |
| **Telangana** | **Hyderabad** | Greater Hyderabad Municipal Corp (GHMC) | K. Ronald Rose, IAS |
| **Telangana** | **Karimnagar** | Karimnagar District Collectorate & MCK | Pamela Satpathy, IAS |
| **Andhra Pradesh** | **Visakhapatnam** | Greater Visakhapatnam Municipal Corp (GVMC) | Dr. A. Mallikarjuna, IAS |
| **Andhra Pradesh** | **Vijayawada** | Vijayawada Municipal Corporation (VMC) | S. Dilli Rao, IAS |
| **Andhra Pradesh** | **Guntur & Amaravati** | Guntur Municipal Corp & AP CRDA | M. Venugopal Reddy, IAS |
| **Andhra Pradesh** | **Tirupati** | Municipal Corporation of Tirupati (MCT) | K. Venkata Ramana Reddy, IAS |

---

## 🛠️ Technology Stack

* **Backend:** Python 3, Flask, Werkzeug
* **Database Engine:** Dual Engine (PostgreSQL Neon Cloud via `psycopg2` with automatic local SQLite fallback)
* **AI Intelligence:** Google Gemini 2.5 Flash (`google-genai`), Groq fallback
* **Frontend:** Vanilla HTML5, Modern CSS3 (Enterprise White & Tech Blue), Vanilla JS (ES6+), Leaflet.js GIS
* **GIS Map Tiles:** CARTO Voyager & OpenStreetMap

---

## ⚡ Quickstart Guide

### 1. Clone the Repository
```bash
git clone https://github.com/rohith1246/desk.git
cd desk
```

### 2. Set Up Virtual Environment & Dependencies
```bash
python -m venv venv
# On Windows
.\venv\Scripts\activate
# On Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` with your API keys:
```env
DATABASE_URL=postgresql://user:password@ep-broad-tree-a50nkols-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
PORT=5050
```

### 4. Run the Platform Locally
```bash
python app.py
```
Open your browser at `http://localhost:5050`.

---

## 🌐 Deploying to Render & Custom Subdomain (`desk.vitoniya.com`)

This repository is pre-configured for **Render** with `render.yaml`, `Procfile`, and `runtime.txt`.

### Step 1: Create Web Service on Render
1. Log into [Render.com](https://dashboard.render.com).
2. Click **New +** &rarr; **Web Service**.
3. Select **Build and deploy from a Git repository** and connect `https://github.com/rohith1246/desk`.
4. Configure service settings:
   * **Name:** `vitoniya-desk`
   * **Language / Runtime:** `Python 3`
   * **Region:** Any (e.g. `Oregon (US West)` or `Singapore`)
   * **Branch:** `main`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 120 app:app`
   * **Health Check Path:** `/health`

### Step 2: Set Environment Variables on Render
Under the **Environment** tab on your Render web service, add:
* `DATABASE_URL`: Your PostgreSQL Neon connection string (e.g. `postgresql://neondb_owner:...@ep-broad-tree-a50nkols-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`)
* `GEMINI_API_KEY`: Your Google Gemini API key
* `GROQ_API_KEY`: Your Groq API key (optional fallback)
* `PYTHON_VERSION`: `3.11.9`

### Step 3: Attach Custom Subdomain (`desk.vitoniya.com`)
1. In the Render Dashboard, go to your service &rarr; **Settings** &rarr; **Custom Domains**.
2. Click **Add Custom Domain** and enter:
   ```
   desk.vitoniya.com
   ```
3. Render will provide a CNAME target:
   ```
   vitoniya-desk.onrender.com (or your specific service address)
   ```
4. In your DNS Provider (Cloudflare, GoDaddy, Hostinger, AWS Route 53, or Namecheap) managing `vitoniya.com`:
   * **Type:** `CNAME`
   * **Name / Host:** `desk`
   * **Target / Value:** `<your-service-name>.onrender.com`
   * **Proxy Status:** DNS Only (or Proxied if using Cloudflare)
   * **TTL:** Auto (or 3600)
5. Click **Verify** in Render. Render automatically provisions a free Let's Encrypt **SSL Certificate** (`https://desk.vitoniya.com`).

---

## 📄 License
Architected & Developed by **Vitoniya Global Technologies**. Distributed under the MIT License.
