const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const app = express();

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err));


// ─── Student Schema ───────────────────────────────────────────────────────────
const studentSchema = new mongoose.Schema({
  rollNumber:   String,
  name:         String,
  studentPhone: String,
  parentName:   String,
  parentPhone:  String,
  branch:       String,
  password:     String,
  photo:        String,
  role: { type: String, default: 'student' }
});
const Student = mongoose.model('Student', studentSchema);

// ─── Staff Schema ─────────────────────────────────────────────────────────────
// roles stored as: hod | incharge | nurse | security  (all lowercase, normalized)
const staffSchema = new mongoose.Schema({
  role:     String,
  id:       String,
  name:     String,
  password: String,
  email:    String,
  phone:    String
});
const Staff = mongoose.model('Staff', staffSchema);

// ─── Hardcoded Staff Fallback ─────────────────────────────────────────────────
// These are used ONLY if MongoDB Staff collection returns no result.
// Matches final_staff_credentials.xlsx exactly.
const HARDCODED_STAFF = [
  { role: 'hod',      id: 'HOD',      password: 'hod123',     email: 'hod@college.com',      phone: '9000000001' },
  { role: 'incharge', id: 'INCHARGE', password: 'incharge123', email: 'incharge@college.com', phone: '9000000002' },
  { role: 'nurse',    id: 'NURSE',    password: 'nurse123',   email: 'nurse@college.com',    phone: '9000000003' },
  { role: 'security', id: 'gate',     password: '1111',       email: 'security@college.com', phone: '9000000004' }
];

function hardcodedStaffLogin(role, id, password) {
  const entry = HARDCODED_STAFF.find(
    s => s.role === role.toLowerCase() &&
         s.id === id &&
         String(s.password) === String(password)
  );
  return entry || null;
}

function hardcodedStaffById(role, id) {
  return HARDCODED_STAFF.find(
    s => s.role === role.toLowerCase() && s.id === id
  ) || null;
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── JSON Data Files ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
  requests:      path.join(DATA_DIR, 'requests.json'),
  otps:          path.join(DATA_DIR, 'otps.json'),
  notifications: path.join(DATA_DIR, 'notifications.json')
};

Object.values(FILES).forEach(f => {
  if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
});

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}
function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Helper: photo URL from roll number
function photoUrl(rollNumber) {
  if (!rollNumber) return null;
  return '/photos/' + rollNumber + '.jpg';
}

// Helper: convert Student doc to safe object for frontend
function studentToSafe(s) {
  return {
    id:           s.rollNumber,
    rollNumber:   s.rollNumber,
    name:         s.name         || '',
    phone:        s.studentPhone || '',
    studentPhone: s.studentPhone || '',
    parentName:   s.parentName   || '',
    parentPhone:  s.parentPhone  || '',
    branch:       s.branch       || '',
    email:        '',
    image:        photoUrl(s.rollNumber),
    role:         'student'
  };
}

// Helper: normalize role from frontend to DB key
// Frontend sends: student | incharge | hod | nurse | security
function normalizeRole(role) {
  return String(role || '').toLowerCase().trim();
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
app.post('/login', async (req, res) => {
  try {
    const { role, id, password } = req.body;
    const roleKey = normalizeRole(role);

    if (roleKey === 'student') {

  console.log("LOGIN REQUEST:", id, password);   // DEBUG

  const student = await Student.findOne({
    rollNumber: id.toUpperCase().trim()
  });

  console.log("DB STUDENT:", student);   // DEBUG

  if (!student) {
    return res.json({
      success: false,
      message: 'Student not found'
    });
  }

  console.log("DB PASSWORD:", student.password);   // DEBUG

  if (String(student.password).trim() !== String(password).trim()) {
    return res.json({
      success: false,
      message: 'Wrong password'
    });
  }

  return res.json({
    success: true,
    user: student
  });
} else {
      // Staff login — try MongoDB first, fallback to hardcoded
      let staffUser = null;

      try {
        // MongoDB query uses normalized lowercase role
        const dbStaff = await Staff.findOne({ id: id, role: roleKey });
        if (dbStaff) {
          if (String(dbStaff.password) !== String(password)) {
            return res.json({ success: false, message: 'Incorrect password.' });
          }
          staffUser = { id: dbStaff.id, role: dbStaff.role, email: dbStaff.email || '', phone: dbStaff.phone || '' };
        }
      } catch (dbErr) {
        console.warn('MongoDB staff query failed, using hardcoded:', dbErr.message);
      }

      // If not found in MongoDB, check hardcoded credentials
      if (!staffUser) {
        const hc = hardcodedStaffLogin(roleKey, id, password);
        if (hc) {
          staffUser = { id: hc.id, role: hc.role, email: hc.email, phone: hc.phone };
        }
      }

      if (!staffUser) {
        return res.json({ success: false, message: 'Staff ID not found or incorrect password.' });
      }

      return res.json({ success: true, user: staffUser });
    }

  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// ─── GET USER ─────────────────────────────────────────────────────────────────
app.get('/user/:role/:id', async (req, res) => {
  try {
    const { role, id } = req.params;
    const roleKey = normalizeRole(role);

    if (roleKey === 'student') {
      const student = await Student.findOne({ rollNumber: id });
      if (!student) return res.json({ success: false });
      return res.json({ success: true, user: studentToSafe(student) });
    } else {
      let staffUser = null;
      try {
        const dbStaff = await Staff.findOne({ id, role: roleKey });
        if (dbStaff) {
          staffUser = { id: dbStaff.id, role: dbStaff.role, email: dbStaff.email || '', phone: dbStaff.phone || '' };
        }
      } catch (e) {}

      if (!staffUser) {
        const hc = hardcodedStaffById(roleKey, id);
        if (hc) staffUser = { id: hc.id, role: hc.role, email: hc.email, phone: hc.phone };
      }

      if (!staffUser) return res.json({ success: false });
      return res.json({ success: true, user: staffUser });
    }
  } catch (error) {
    console.error('GET user error:', error);
    res.json({ success: false });
  }
});

// ─── PROFILE ──────────────────────────────────────────────────────────────────
app.get('/profile/:role/:id', async (req, res) => {
  try {
    const { role, id } = req.params;
    const roleKey = normalizeRole(role);

    if (roleKey === 'student') {
      const student = await Student.findOne({ rollNumber: id });
      if (!student) return res.json({ success: false, message: 'Student not found.' });
      return res.json({
        success: true,
        profile: {
          type: 'student',
          name:         student.name         || '',
          rollNumber:   student.rollNumber   || '',
          studentPhone: student.studentPhone || '',
          parentName:   student.parentName   || '',
          parentPhone:  student.parentPhone  || '',
          branch:       student.branch       || '',
          email:        student.email        || '',
          photo:        photoUrl(student.rollNumber)
        }
      });
    } else {
      let staffUser = null;
      try {
        const dbStaff = await Staff.findOne({ id, role: roleKey });
        if (dbStaff) {
          staffUser = {
            type:  'staff',
            id:    dbStaff.id,
            role:  dbStaff.role,
            email: dbStaff.email || '',
            phone: dbStaff.phone || '',
            name:  dbStaff.name  || ''
          };
        }
      } catch (e) {}

      if (!staffUser) {
        const hc = hardcodedStaffById(roleKey, id);
        if (hc) {
          staffUser = {
            type:  'staff',
            id:    hc.id,
            role:  hc.role,
            email: hc.email || '',
            phone: hc.phone || '',
            name:  hc.name  || ''
          };
        }
      }

      if (!staffUser) return res.json({ success: false, message: 'Staff not found.' });
      return res.json({ success: true, profile: staffUser });
    }
  } catch (error) {
    console.error('Profile error:', error);
    res.json({ success: false, message: 'Failed to load profile.' });
  }
});

// ─── CREATE REQUEST ───────────────────────────────────────────────────────────
app.post('/create-request', async (req, res) => {
  try {
    const { studentId, category, reason, otherReason, file, entryTime, exitTime } = req.body;

    const student = await Student.findOne({ rollNumber: studentId });
    if (!student) return res.json({ success: false, message: 'Student not found in database.' });

    const requests = read(FILES.requests);
    const active = requests.find(r =>
      r.studentId === studentId &&
      ['pending', 'nurse', 'incharge', 'hod', 'otp_ready'].includes(r.status)
    );
    if (active) return res.json({ success: false, message: 'You already have a pending request.' });

    const reqObj = {
      requestId:   'REQ_' + Date.now(),
      studentId,
      category,
      reason,
      otherReason: otherReason || '',
      file:        file        || null,
      entryTime:   entryTime   || null,
      exitTime:    exitTime    || null,
      status:      category === 'medical' ? 'nurse' : 'incharge',
      createdAt:   Date.now(),
      studentData: {
        id:           student.rollNumber,
        rollNumber:   student.rollNumber,
        name:         student.name         || '',
        phone:        student.studentPhone || '',
        studentPhone: student.studentPhone || '',
        parentName:   student.parentName   || '',
        parentPhone:  student.parentPhone  || '',
        branch:       student.branch       || '',
        email:        '',
        image:        photoUrl(student.rollNumber)
      }
    };

    requests.push(reqObj);
    write(FILES.requests, requests);

    addNotification(
      studentId, 'student',
      'Request submitted. Status: ' + (reqObj.status === 'nurse' ? 'Sent to Nurse' : 'Sent to In-Charge')
    );

    res.json({ success: true, requestId: reqObj.requestId });

  } catch (error) {
    console.error('Create request error:', error);
    res.json({ success: false, message: 'Failed to create request.' });
  }
});

// ─── GET REQUESTS BY ROLE ─────────────────────────────────────────────────────
app.get('/requests/:role', (req, res) => {
  const requests = read(FILES.requests);
  const role = req.params.role;
  let filtered;

  if      (role === 'nurse')            filtered = requests.filter(r => r.status === 'nurse');
  else if (role === 'incharge')         filtered = requests.filter(r => r.status === 'incharge');
  else if (role === 'hod')              filtered = requests.filter(r => r.status === 'hod');
  else if (role === 'security')         filtered = requests.filter(r => r.status === 'otp_ready');
  else if (role === 'rejected-incharge') filtered = requests.filter(r =>
    r.status === 'rejected' && (r.rejectedBy === 'nurse' || r.rejectedBy === 'hod')
  );
  else if (role === 'student') {
    const sid = req.query.studentId;
    filtered = requests.filter(r => r.studentId === sid);
  }
  else filtered = requests;

  res.json({ success: true, requests: filtered });
});

// ─── APPROVE ──────────────────────────────────────────────────────────────────
app.post('/approve', (req, res) => {
  const { requestId, role } = req.body;
  const requests = read(FILES.requests);
  const idx = requests.findIndex(r => r.requestId === requestId);
  if (idx === -1) return res.json({ success: false, message: 'Request not found' });
  const r = requests[idx];

  if (role === 'nurse' && r.status === 'nurse') {
    r.status = 'incharge';
    r.nurseApprovedAt = Date.now();
    addNotification(r.studentId, 'student', 'Nurse approved. Sent to In-Charge.');
    addNotification('all_incharge', 'incharge', 'Medical request from ' + r.studentId + ' forwarded by Nurse.');

  } else if (role === 'incharge' && r.status === 'incharge') {
    r.status = 'hod';
    r.inchargeApprovedAt = Date.now();
    addNotification(r.studentId, 'student', 'In-Charge approved. Sent to HOD.');
    addNotification('all_hod', 'hod', 'Request from ' + r.studentId + ' approved by In-Charge.');

  } else if (role === 'hod' && r.status === 'hod') {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    r.status        = 'otp_ready';
    r.hodApprovedAt = Date.now();
    r.otp           = otp;
    r.otpExpiry     = Date.now() + 600000;
    addNotification(r.studentId, 'student', 'HOD approved! Your OTP is: ' + otp + '. Valid for 10 minutes.');
    addNotification('all_security', 'security', 'Student ' + r.studentId + ' OTP ready for exit.');

  } else {
    return res.json({ success: false, message: 'Invalid role or request status' });
  }

  write(FILES.requests, requests);
  res.json({ success: true });
});

// ─── REJECT ───────────────────────────────────────────────────────────────────
app.post('/reject', (req, res) => {
  const { requestId, role, reason } = req.body;
  const requests = read(FILES.requests);
  const idx = requests.findIndex(r => r.requestId === requestId);
  if (idx === -1) return res.json({ success: false });
  const r = requests[idx];

  r.status          = 'rejected';
  r.rejectedBy      = role;
  r.rejectedAt      = Date.now();
  r.rejectionReason = reason || '';

  addNotification(r.studentId, 'student', 'Request rejected by ' + role + '. Reason: ' + (reason || 'Not specified'));
  if (role === 'nurse')   addNotification('all_incharge', 'incharge', 'Nurse rejected request from ' + r.studentId + '.');
  if (role === 'hod')     addNotification('all_incharge', 'incharge', 'HOD rejected request from ' + r.studentId + '.');

  write(FILES.requests, requests);
  res.json({ success: true });
});

// ─── HOD APPROVED TODAY ───────────────────────────────────────────────────────
app.get('/hod-approved-today', (req, res) => {
  const requests = read(FILES.requests);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const approved = requests.filter(r => r.hodApprovedAt && r.hodApprovedAt >= startOfDay.getTime());
  res.json({ success: true, requests: approved });
});

// ─── SECURITY: Verify OTP (step 1) ───────────────────────────────────────────
app.post('/security-verify-otp', (req, res) => {
  const { requestId, otp } = req.body;
  const requests = read(FILES.requests);
  const req2 = requests.find(r => r.requestId === requestId && r.status === 'otp_ready');
  if (!req2) return res.json({ success: false, message: 'Request not found or already processed.' });

  if (Date.now() > req2.otpExpiry) {
    req2.status = 'expired';
    write(FILES.requests, requests);
    return res.json({ success: false, message: 'OTP expired.' });
  }

  if (req2.otp !== otp) return res.json({ success: false, message: 'Wrong OTP. Please re-check.' });

  req2.otpVerified = true;
  write(FILES.requests, requests);
  res.json({ success: true, message: 'OTP verified. Proceed with photo verification.' });
});

// ─── SECURITY: Finalize exit after photo verification ────────────────────────
app.post('/security-photo-approve', (req, res) => {
  const { requestId } = req.body;
  const requests = read(FILES.requests);
  const req2 = requests.find(r => r.requestId === requestId && r.status === 'otp_ready' && r.otpVerified);
  if (!req2) return res.json({ success: false, message: 'OTP not verified or request not found.' });

  req2.status   = 'exited';
  req2.exitedAt = Date.now();
  write(FILES.requests, requests);

  addNotification(req2.studentId, 'student', 'Exit confirmed at ' + new Date().toLocaleString() + '. Safe travels!');
  addNotification('all_incharge', 'incharge', 'Student ' + req2.studentId + ' has exited at ' + new Date().toLocaleString() + '.');

  res.json({ success: true, exitTime: req2.exitedAt });
});

// ─── SECURITY: Reject exit ───────────────────────────────────────────────────
app.post('/security-reject', (req, res) => {
  const { requestId } = req.body;
  const requests = read(FILES.requests);
  const idx = requests.findIndex(r => r.requestId === requestId && r.status === 'otp_ready');
  if (idx === -1) return res.json({ success: false, message: 'Request not found.' });
  const r = requests[idx];

  r.status     = 'rejected';
  r.rejectedBy = 'security';
  r.rejectedAt = Date.now();
  write(FILES.requests, requests);

  addNotification(r.studentId, 'student', 'Security rejected your exit request. Please contact In-Charge.');
  addNotification('all_incharge', 'incharge', 'Security rejected exit request for student ' + r.studentId + '.');

  res.json({ success: true });
});

// ─── LEGACY: verify-otp ───────────────────────────────────────────────────────
app.post('/verify-otp', (req, res) => {
  const { studentId, otp } = req.body;
  const requests = read(FILES.requests);
  const req2 = requests.find(r => r.studentId === studentId && r.status === 'otp_ready');
  if (!req2) return res.json({ success: false, message: 'No pending OTP for this student.' });

  if (Date.now() > req2.otpExpiry) {
    req2.status = 'expired';
    write(FILES.requests, requests);
    return res.json({ success: false, message: 'OTP expired.' });
  }

  if (req2.otp !== otp) return res.json({ success: false, message: 'Wrong OTP.' });

  req2.status   = 'exited';
  req2.exitedAt = Date.now();
  write(FILES.requests, requests);

  addNotification(studentId, 'student', 'Exit confirmed at ' + new Date().toLocaleString() + '. Safe travels!');
  addNotification('all_incharge', 'incharge', 'Student ' + studentId + ' has exited at ' + new Date().toLocaleString() + '.');

  res.json({ success: true, exitTime: req2.exitedAt });
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
function addNotification(targetId, targetRole, message) {
  const notifs = read(FILES.notifications);
  notifs.push({
    id:         'N_' + Date.now() + Math.random(),
    targetId,
    targetRole,
    message,
    time:       Date.now(),
    read:       false
  });
  write(FILES.notifications, notifs);
}

app.get('/notifications/:targetId', (req, res) => {
  const notifs   = read(FILES.notifications);
  const filtered = notifs.filter(n => n.targetId === req.params.targetId && !n.read);
  res.json({ success: true, notifications: filtered });
});

app.post('/notifications/mark-read', (req, res) => {
  const { targetId } = req.body;
  const notifs = read(FILES.notifications);
  notifs.forEach(n => { if (n.targetId === targetId) n.read = true; });
  write(FILES.notifications, notifs);
  res.json({ success: true });
});

// ─── PERSONAL TIME VIOLATION CHECKER ─────────────────────────────────────────
function checkPersonalTimeViolations() {
  const requests = read(FILES.requests);
  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  requests.forEach(r => {
    if (
      r.category === 'personal' &&
      r.exitTime &&
      !r.timeViolationNotified &&
      !['rejected', 'expired', 'exited'].includes(r.status)
    ) {
      const exitDateTime = new Date(todayStr + 'T' + r.exitTime + ':00');
      if (now > exitDateTime) {
        addNotification(r.studentId, 'student',
          '⚠️ Warning: You did not return within the allowed time. Expected return: ' + r.exitTime + '. Report to In-Charge immediately.'
        );
        addNotification('all_incharge', 'incharge',
          '🚨 Time Violation: Student ' + r.studentId + ' did not return on time. Expected: ' + r.exitTime + '. Request: ' + r.requestId + '.'
        );
        r.timeViolationNotified = true;
      }
    }
  });

  write(FILES.requests, requests);
}

checkPersonalTimeViolations();
setInterval(checkPersonalTimeViolations, 60000);

// ─── HISTORY: Full request history for HOD and In-Charge ─────────────────────
// Returns all requests (no deletions). Supports filters: rollNumber, name,
// date (YYYY-MM-DD), branch, category, status.
app.get('/history', async (req, res) => {
  try {
    // Role guard: only hod or incharge
    const callerRole = (req.query.role || '').toLowerCase().trim();
    if (callerRole !== 'hod' && callerRole !== 'incharge') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    let requests = read(FILES.requests);

    // Enrich each request with student name/branch from MongoDB if missing
    const rollNumbers = [...new Set(requests.map(r => r.studentId).filter(Boolean))];
    let studentMap = {};
    try {
      const students = await Student.find({ rollNumber: { $in: rollNumbers } });
      students.forEach(s => {
        studentMap[s.rollNumber] = {
          name:        s.name         || '',
          branch:      s.branch       || '',
          parentPhone: s.parentPhone  || '',
          rollNumber:  s.rollNumber   || ''
        };
      });
    } catch (e) { /* fallback to studentData already on request */ }

    // Build enriched list
    let history = requests.map(r => {
      const sd   = r.studentData || {};
      const info = studentMap[r.studentId] || {};
      return {
        requestId:       r.requestId,
        studentId:       r.studentId,
        studentName:     info.name        || sd.name        || '',
        rollNumber:      r.studentId,
        branch:          info.branch      || sd.branch      || '',
        parentPhone:     info.parentPhone || sd.parentPhone || '',
        category:        r.category       || '',
        reason:          r.reason         || '',
        otherReason:     r.otherReason    || '',
        status:          r.status         || '',
        createdAt:       r.createdAt      || null,
        exitTime:        r.exitTime       || null,
        exitedAt:        r.exitedAt       || null,
        rejectedBy:      r.rejectedBy     || '',
        rejectedAt:      r.rejectedAt     || null,
        rejectionReason: r.rejectionReason|| '',
        nurseApprovedAt: r.nurseApprovedAt    || null,
        inchargeApprovedAt: r.inchargeApprovedAt || null,
        hodApprovedAt:   r.hodApprovedAt  || null,
        approvedBy: (() => {
          const chain = [];
          if (r.nurseApprovedAt)    chain.push('Nurse');
          if (r.inchargeApprovedAt) chain.push('In-Charge');
          if (r.hodApprovedAt)      chain.push('HOD');
          return chain.join(' → ') || '';
        })()
      };
    });

    // Apply filters
    const { rollNumber, name, date, branch, category, status } = req.query;

    if (rollNumber) {
      const q = rollNumber.toLowerCase();
      history = history.filter(r => r.rollNumber.toLowerCase().includes(q));
    }
    if (name) {
      const q = name.toLowerCase();
      history = history.filter(r => r.studentName.toLowerCase().includes(q));
    }
    if (branch) {
      history = history.filter(r => r.branch.toLowerCase() === branch.toLowerCase());
    }
    if (category) {
      history = history.filter(r => r.category.toLowerCase() === category.toLowerCase());
    }
    if (status) {
      history = history.filter(r => r.status.toLowerCase() === status.toLowerCase());
    }
    if (date) {
      // date format: YYYY-MM-DD
      history = history.filter(r => {
        if (!r.createdAt) return false;
        const d = new Date(r.createdAt).toISOString().slice(0, 10);
        return d === date;
      });
    }

    // Sort: newest first
    history.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({ success: true, history });
  } catch (error) {
    console.error('History error:', error);
    res.json({ success: false, message: 'Failed to load history.' });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(process.env.PORT || 3000, () =>
  console.log('🚀 Server running')
);