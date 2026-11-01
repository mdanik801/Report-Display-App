# 🏭 Industrial Monitor & Digital Signage Dashboard

An offline-first, high-reliability web dashboard designed for factory floors, warehouse balance tracking, and line management across local area networks (LAN). Built with a Node.js / Express backend and a responsive Light Industrial UI theme (`#0F4C3A` dark green, `#F3F4F6` soft gray, `#FFFFFF` high-contrast KPI cards).

---

## 📋 Table of Contents
- [Key Features](#-key-features)
- [Prerequisites](#-prerequisites)
- [Project Setup & Installation](#-project-setup--installation)
- [Running the Server](#-running-the-server)
- [Accessing the Dashboard](#-accessing-the-dashboard)
  - [Local PC Access](#1-local-pc-access)
  - [Smart TV & LAN Display Access](#2-smart-tv--lan-display-access)
  - [Windows Firewall Setup](#3-windows-firewall-configuration)
- [Project Directory Structure](#-project-directory-structure)
- [Operational Guide](#-operational-guide)
  - [Switching Dashboard Views](#switching-dashboard-views)
  - [Pasting Excel Data](#pasting-data-from-excel)
  - [1-Minute Notice Slideshow (Dhopash & Thopash)](#1-minute-notice-slideshow)
  - [Auto-Scroll & Mouse Controls](#auto-scroll--mouse-controls)
- [Customizing Posters & Logo](#-customizing-posters--logo)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## ⚡ Key Features

- **No Domain / Internet Required:** Operates 100% offline within your local shop-floor LAN network.
- **Dual Industrial Views:**
  1. **Fabric Store Balance Report:** Opening yardage, receipts, issues, current balance, roll count, rack locations, and stock alerts.
  2. **Finishing Floor Line Cards:** Real-time line cards (Lines A–Q), buyer, style, target vs. actual output, manpower, SMV, and circular line efficiency gauges.
- **Excel Copy-Paste Integration:** Copy cells directly from Microsoft Excel or Google Sheets and paste via the admin modal with instant parsing and `localStorage` persistence.
- **1-Minute Notice Slideshow ("Dhopash" & "Thopash"):** Built-in countdown timer automatically displays factory safety notices, alerts, or bulletins with smooth spring pop-in and fade-out animations.
- **Continuous Auto-Scroll:** Hands-free vertical scrolling designed for wall-mounted TV monitors. Instantly pauses on mouse hover and resumes when the pointer leaves.

---

## 📌 Prerequisites

Before running this application on any machine, ensure **Node.js** is installed.

### 1. Check Node.js Installation
Open your terminal (PowerShell, Command Prompt, or Terminal) and run:
```bash
node -v
npm -v
```
*Expected output: Node.js version `v16.0.0` or higher (e.g., `v18.x`, `v20.x`) and npm `v8.x` or higher.*

### 2. If Node.js is Not Installed:
- Download the official **LTS (Long Term Support)** installer from [https://nodejs.org](https://nodejs.org/).
- Run the installer, keep default settings checked, and restart your terminal.

---

## 📦 Project Setup & Installation

Clone or copy the project folder to the target PC:

```bash
cd "D:\Softwer DEV\Report Display"
```

Install the required dependencies:
```bash
npm install
```

> [!TIP]
> **Windows PowerShell Execution Policy Note:**  
> If PowerShell blocks `npm install` with `File npm.ps1 cannot be loaded because running scripts is disabled`, run:
> ```cmd
> cmd /c npm install
> ```
> *Note: Even without `npm install`, the server features a native zero-dependency fallback that can run directly via Node.js.*

---

## 🚀 Running the Server

You can start the server using any of the following methods:

### Method A: Using npm (Recommended)
```bash
npm start
```

### Method B: Direct Node Execution
```bash
node server.js
```

### Method C: One-Click Windows Batch File (For Operators)
Simply double-click the [**`start.bat`**](start.bat) file located in the root directory. This opens a dedicated terminal and keeps the service active.

---

## 🌐 Accessing the Dashboard

When the server starts, it prints a terminal startup banner displaying all accessible addresses:

```text
======================================================================
  🏭 INDUSTRIAL MONITOR & DIGITAL SIGNAGE DASHBOARD
  ⚡ Server Engine:        Express.js [Port: 3000]
======================================================================
  🖥️  Local Host Access:   http://localhost:3000
  📁 Public Root:          D:\Softwer DEV\Report Display\public
  🖼️  Posters Folder:       D:\Softwer DEV\Report Display\posters
----------------------------------------------------------------------
  🌐 LAN / SMART TV DIRECT ACCESS URLS:
     👉 [Ethernet]:  http://192.168.108.54:3000
----------------------------------------------------------------------
```

### 1. Local PC Access
On the computer hosting the server, open any web browser (Google Chrome, Microsoft Edge, or Firefox) and visit:
```text
http://localhost:3000
```

### 2. Smart TV & LAN Display Access
Any Smart TV, tablet, or secondary computer connected to the same Wi-Fi router or factory switch can access the dashboard directly using the host machine's IP address:
```text
http://<HOST_IP_ADDRESS>:3000
```
*Example for the current network:*
```text
http://192.168.108.54:3000
```

### 3. Windows Firewall Configuration
If external Smart TVs or PCs cannot load the page, allow incoming traffic on Port 3000 through Windows Defender Firewall:
1. Open PowerShell **as Administrator**.
2. Run the following command:
```powershell
New-NetFirewallRule -DisplayName "Industrial Dashboard (Port 3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

---

## 📂 Project Directory Structure

```text
industrial-display/
├── package.json          # Project metadata, scripts ("npm start"), dependencies
├── server.js             # Express LAN static server & /api/posters scanner
├── start.bat             # 1-click Windows batch launcher
├── README.md             # Technical documentation & deployment instructions
│
├── posters/              # Media asset repository
│   ├── logo.png          # Factory brand logo (rendered in top navbar)
│   ├── notice.jpg        # Active bulletin poster (shown in 1-min overlay)
│   └── safety-rules.png  # Optional additional notice posters (.jpg, .png, .webp)
│
└── public/               # Client-side frontend assets
    ├── index.html        # Single-page industrial UI (KPIs, tables, modals)
    ├── style.css         # Light Industrial theme styling & keyframe animations
    └── script.js         # Auto-scrolling, 1-min timer, Excel parser & localStorage
```

### Folder Roles:
- **`public/`**: Contains the frontend interface. Handled statically by `server.js` and served at root `/`.
- **`posters/`**: Houses all images. The server exposes this folder at `/posters` and scans it via `/api/posters` (excluding `logo.png`) so any newly added images automatically rotate into the notice slideshow without requiring a code rebuild.

---

## 🛠️ Operational Guide

### Switching Dashboard Views
Use the view toggle buttons in the top header:
- **Fabric Store View:** Displays top 5 inventory KPIs and the full inventory balance table.
- **Finishing Floor View:** Displays floor manpower, average SMV, floor efficiency %, and card-by-card status boards for Lines A through Q.

### Pasting Data from Excel
1. Click the **"+ Paste Excel"** button in the top navbar.
2. Select the report type:
   - *Fabric Store Balance Report*
   - *Finishing Floor Daily Report*
3. Select and copy cells from your Excel spreadsheet (`Ctrl + C`).
4. Click inside the modal textarea and paste (`Ctrl + V`).
5. Click **"Process & Update Dashboard"**.
   - Totals and KPIs update automatically.
   - Data is preserved across page refreshes via browser `localStorage`.

### 1-Minute Notice Slideshow
- The top navbar features a live countdown timer (`01:00`).
- Every 60 seconds, the auto-scroll pauses and the **Dhopash** overlay pops up with your bulletin notice.
- The poster stays visible for **15 seconds** with an animated countdown progress bar.
- It then executes a smooth **Thopash** fade-out animation and resumes dashboard auto-scrolling.
- Click the timer button at any time to immediately preview the notice modal.

### Auto-Scroll & Mouse Controls
- Tables and line cards scroll continuously down the page and loop seamlessly back to the top.
- **Pause on Hover:** Move the mouse pointer over the table to freeze auto-scrolling for manual inspection.
- **Resume:** Move the mouse away; auto-scrolling resumes within 5 seconds of inactivity.
- **Speed Selector:** Adjust between Slow, Normal, and Fast using the dropdown next to the Auto-Scroll status badge.

---

## 🖼️ Customizing Posters & Logo

### Changing the Company Logo:
1. Replace [`posters/logo.png`](posters/logo.png) with your company logo file.
2. Keep the file name as `logo.png` (transparency supported, 40px to 80px height recommended).

### Adding Notice Slides / Bulletins:
1. Save any announcement image (`.jpg`, `.jpeg`, `.png`, `.webp`) into the [`posters/`](posters/) directory.
2. The server's `/api/posters` endpoint automatically indexes all valid images (excluding `logo.png`).
3. If multiple notice images exist, the slideshow cycles through each slide consecutively.

---

## ❓ Troubleshooting & FAQ

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **`npm : File ... npm.ps1 cannot be loaded`** | Windows PowerShell Script Execution Policy | Run `cmd /c npm start` or execute `node server.js` directly. |
| **Smart TV shows `Site can't be reached`** | Windows Firewall blocking Port 3000 | Run the PowerShell firewall command in [Section 3](#3-windows-firewall-configuration). |
| **Smart TV cannot connect** | TV and PC are on different Wi-Fi networks | Verify both the Host PC and the TV are on the same subnet (e.g., `192.168.108.x`). |
| **Port 3000 already in use** | Another instance or app is using Port 3000 | Launch on a custom port: `PORT=3001 node server.js`. |
| **Images do not display** | Filename typo or unsupported format | Ensure logo is named `logo.png` and posters use `.jpg`, `.jpeg`, or `.png`. |

---

## 📄 License & Maintainer
- **System:** Industrial Monitor & Digital Signage Dashboard
- **License:** MIT (Permissive for internal industrial & commercial use)
- **Deployment Type:** Local LAN On-Premises

