# SwiftPass — Gate Pass Management System

## Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Import Students into MongoDB (run ONCE)
```bash
node importStudents.js
```

### 3. Import Staff into MongoDB (run ONCE)
```bash
node importStaff.js
```
> This normalizes role names (In-Charge → incharge, HOD → hod, etc.)
> so they match what the login page sends.

### 4. Start the server
```bash
node server.js
```

Open **http://localhost:3000**

---

## Login Credentials

### Students
- **Roll Number**: e.g. `24261A1201`
- **Password**: as set in `students_project_ready.xlsx`

### Staff (Fixed Credentials — cannot register, login only)

| Role     | ID       | Password     |
|----------|----------|--------------|
| HOD      | HOD      | hod123       |
| In-Charge| INCHARGE | incharge123  |
| Nurse    | NURSE    | nurse123     |
| Security | gate     | 1111         |

> **Note:** Staff credentials work even before running `importStaff.js` —
> the server has a built-in hardcoded fallback matching the Excel file.

---

## What Was Fixed

### Problem
`importStaff.js` was storing role names directly from Excel (`In-Charge`, `HOD`, `Nurse`, `Security`),
but the login page sends lowercase keys (`incharge`, `hod`, `nurse`, `security`).
This caused `Staff.findOne({ role: 'incharge' })` to never match `'In-Charge'` in the DB.

### Fix Applied
1. **`importStaff.js`** — now normalizes roles before saving:
   - `In-Charge` → `incharge`
   - `HOD` → `hod`
   - `Nurse` → `nurse`
   - `Security` → `security`

2. **`server.js`** — login route now:
   - Normalizes the incoming role to lowercase before querying MongoDB
   - Falls back to hardcoded credentials if MongoDB has no matching staff record
   - Both MongoDB and hardcoded paths behave identically

3. **All other features unchanged** — request flow, approvals, rejections,
   OTP, notifications, photo verification, dashboards — all exactly as before.

---

## Architecture
- **MongoDB** — Students + Staff (credentials only)
- **JSON files** (`data/`) — Requests, Notifications, OTPs (runtime state)
- **Roles**: student → nurse (medical only) → incharge → hod → security
