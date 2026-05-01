const mongoose = require("mongoose");
const XLSX = require("xlsx");

mongoose.connect("mongodb://admin:Pavithra123@ac-3z8bfxd-shard-00-00.f4ihd0q.mongodb.net:27017,ac-3z8bfxd-shard-00-01.f4ihd0q.mongodb.net:27017,ac-3z8bfxd-shard-00-02.f4ihd0q.mongodb.net:27017/?ssl=true&replicaSet=atlas-10o2sv-shard-0&authSource=admin&appName=Cluster0")
.then(() => console.log("MongoDB Connected for Import"))
.catch(err => console.log(err));

const studentSchema = new mongoose.Schema({
  rollNumber: String,
  name: String,
  studentPhone: String,
  parentName: String,
  parentPhone: String,
  branch: String,
  password: String,
  photo: String,
  role: {
    type: String,
    default: "student"
  }
});

const Student = mongoose.model("Student", studentSchema);

async function importStudents() {
  const workbook = XLSX.readFile("students_project_ready.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  await Student.deleteMany({});

  for (const row of data) {
    await Student.create({
      rollNumber: row["Roll No"],
      name: row["Name"],
      studentPhone: row["Student Phone"],
      parentName: row["Parent Name"],
      parentPhone: row["Parent Phone"],
      branch: row["Branch"],
      password: String(row["Password"]),
      photo: row["Photo"],
      role: "student"
    });
  }

  console.log("Students Imported Successfully");
  mongoose.connection.close();
}

importStudents();