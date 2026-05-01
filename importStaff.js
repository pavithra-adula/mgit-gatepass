const mongoose = require("mongoose");
const XLSX = require("xlsx");

mongoose.connect("mongodb://admin:Pavithra123@ac-3z8bfxd-shard-00-00.f4ihd0q.mongodb.net:27017,ac-3z8bfxd-shard-00-01.f4ihd0q.mongodb.net:27017,ac-3z8bfxd-shard-00-02.f4ihd0q.mongodb.net:27017/?ssl=true&replicaSet=atlas-10o2sv-shard-0&authSource=admin&appName=Cluster0")
.then(() => console.log("MongoDB Connected for Staff Import"))
.catch(err => console.log(err));

const staffSchema = new mongoose.Schema({
  role: String,
  id: String,
  password: String,
  email: String,
  phone: String
});

const Staff = mongoose.model("Staff", staffSchema);

// Normalize role names from Excel to match frontend role keys
function normalizeRole(rawRole) {
  if (!rawRole) return '';
  const r = String(rawRole).toLowerCase().replace(/[^a-z]/g, '');
  if (r === 'incharge' || r === 'incharge') return 'incharge';
  if (r === 'hod') return 'hod';
  if (r === 'nurse') return 'nurse';
  if (r === 'security') return 'security';
  return r;
}

async function importStaff() {
  const workbook = XLSX.readFile("final_staff_credentials.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  await Staff.deleteMany({});

  for (const row of data) {
    const normalizedRole = normalizeRole(row["Role"]);
    await Staff.create({
      role:     normalizedRole,
      id:       String(row["ID"]),
      password: String(row["Password"]),
      email:    row["Email"]  || '',
      phone:    String(row["Phone"] || '')
    });
    console.log(`  Imported: role=${normalizedRole}, id=${row["ID"]}, password=${row["Password"]}`);
  }

  console.log("✅ Staff Imported Successfully");
  mongoose.connection.close();
}

importStaff();
