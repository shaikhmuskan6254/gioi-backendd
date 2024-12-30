const { auth, database } = require("../config/firebase-config");
const {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} = require("firebase/auth");
const {
  ref,
  get,
  query, 
  orderByChild,
  equalTo,
  update,
  set,

} = require("firebase/database");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt"); // Assuming bcrypt is used for password hashing
const { v4: uuidv4 } = require("uuid");
const xlsx = require("xlsx");
const fs = require("fs");
require("dotenv").config();

const registerSchool = async (req, res) => {
  const { schoolName, email, password, confirmPassword, principalName } =
    req.body;

  // Validate all required fields
  if (!schoolName || !email || !password || !confirmPassword || !principalName) {
    return res.status(400).json({
      message:
        "All fields are required: schoolName, email, password, confirmPassword, and principalName.",
    });
  }

  // Validate if password and confirm password match
  if (password !== confirmPassword) {
    return res
      .status(400)
      .json({ message: "Password and confirm password do not match." });
  }

  try {
    // Register user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Save school details in Firebase Database
    const schoolRef = ref(database, `schools/${user.uid}`);
    await set(schoolRef, {
      uid: user.uid,
      email,
      schoolName,
      principalName, // Store the principal's name
      role: "school", // Assigning the role as 'school'
      createdAt: new Date().toISOString(),
    });

    // Generate JWT token with role included
    const token = jwt.sign(
      { uid: user.uid, email, role: "school" },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "30d" }
    );

    res.status(201).json({ message: "School registered successfully", token });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Failed to register school", error: error.message });
  }
};

// Login for school
const loginSchool = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    const token = jwt.sign(
      { uid: user.uid, email, role: "school" },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "30d" }
    );

    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    console.error(error);
    res
      .status(401)
      .json({ message: "Invalid email or password", error: error.message });
  }
};

const bulkUploadStudents = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {


    // Read uploaded Excel file
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert sheet data to JSON
    const students = xlsx.utils.sheet_to_json(sheet);

    let failedEntries = [];
    let successCount = 0;

    // Save each student in the "gio-students" table
    for (const student of students) {
      try {
        // Validate required fields
        if (
          !student.name ||
          !student.username ||
          !student.password ||
          !student.PhoneNumber ||
          !student.teacherPhoneNumber ||
          !student.whatsappNumber ||
          !student.standard ||
          !student.schoolName ||
          !student.country ||
          !student.state ||
          !student.city
        ) {
          failedEntries.push({
            student,
            reason: "Missing required fields",
          });
          continue;
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(student.password, 10); // Hash with salt rounds

        // Generate a unique ID for the user
        const uid = uuidv4(); // Generate UID for each student

        // Save user details to the Realtime Database
        const userRef = ref(database, `gio-students/${uid}`);
        await set(userRef, {
          name: student.name, // Name from the uploaded data
          username: student.username, // Username from the uploaded data
          password: hashedPassword, // Storing the hashed password
          PhoneNumber: student.PhoneNumber,
          teacherPhoneNumber: student.teacherPhoneNumber,
          whatsappNumber: student.whatsappNumber,
          standard: student.standard,
          schoolName: student.schoolName,
          country: student.country,
          state: student.state,
          city: student.city,
          paymentStatus: "unpaid", // Default value, can be updated later
          testCompleted: false, // Default value, can be updated later
          ranks: {}, // Default empty object for ranks
          createdAt: new Date().toISOString(), // Timestamp of creation
        });

        // Generate JWT token for the student after registration
        const token = jwt.sign(
          { uid, username: student.username, name: student.name }, // Include UID, username, and name in the JWT payload
          process.env.JWT_SECRET_KEY, // Secret key for signing the token
          { expiresIn: "1d" } // Expiration time for the token (1 day)
        );

        successCount++;

        // Add token to the student data in the response
        student.token = token;
      } catch (error) {
        console.error("Error processing student:", error.message);
        failedEntries.push({ student, reason: error.message });
      }
    }

    // Remove the uploaded file after processing
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: "Bulk upload completed",
      successCount,
      failedCount: failedEntries.length,
      failedEntries,
    });
  } catch (error) {
    console.error("Error in bulk upload:", error);
    res.status(500).json({
      message: "Failed to upload students",
      error: error.message,
    });
  }
};

const fetchUsersBySchool = async (req, res) => {
  const { schoolName, standard } = req.query;

  if (!schoolName) {
    return res.status(400).json({ message: "School name is required." });
  }

  try {
    const usersRef = ref(database, "gio-students");
    const snapshot = await get(usersRef);

    if (!snapshot.exists()) {
      return res.status(200).json({ message: "No students found.", users: [] });
    }

    const standardQuery = standard ? standard.trim().toLowerCase() : "";
    const users = [];

    snapshot.forEach((childSnapshot) => {
      const user = childSnapshot.val();

      const matchesSchool =
        user.schoolName &&
        user.schoolName.trim().toLowerCase() ===
          schoolName.trim().toLowerCase();

      let matchesStandard = false;

      if (!standardQuery) {
        matchesStandard = true; // No filter applied
      } else {
        const normalizedStandard =
          typeof user.standard === "number"
            ? String(user.standard)
            : user.standard.trim().toLowerCase();

        const formattedStandardQuery = standardQuery.replace(/th$/, "");

        matchesStandard =
          normalizedStandard === formattedStandardQuery ||
          normalizedStandard === `${formattedStandardQuery}th`;
      }

      if (matchesSchool && matchesStandard) {
        // Include marks, certificateCodes, and other student information
        users.push({
          uid: user.uid,
          name: user.name,
          username: user.username,
          PhoneNumber: user.PhoneNumber,
          teacherPhoneNumber: user.teacherPhoneNumber,
          whatsappNumber: user.whatsappNumber,
          standard: user.standard,
          schoolName: user.schoolName,
          country: user.country,
          state: user.state,
          city: user.city,
          paymentStatus: user.paymentStatus,
          testCompleted: user.testCompleted,
          createdAt: user.createdAt,
          marks: user.marks || {}, // Include marks (default to empty object if not available)
          certificateCodes: user.certificateCodes || [], // Include certificateCodes (default to empty array if not available)
          ranks: {
            live: user.ranks?.live || {},
            mock: user.ranks?.mock || {},
          },
        });
      }
    });

    // If no users match the criteria, return an empty array
    if (users.length === 0) {
      return res.status(200).json({
        message: `No users found for school '${schoolName}' and standard '${standardQuery || "all"}'.`,
        users: [],
      });
    }

    // Fetch all rankings for the fetched users to include school rankings
    const enhancedUsers = await Promise.all(
      users.map(async (user) => {
        // Extract school rankings from each user's ranks
        const schoolRankLive = user.ranks.live.school || {};
        const schoolRankMock = user.ranks.mock.school || {};

        return {
          ...user,
          ranks: {
            live: {
              ...user.ranks.live,
              school: schoolRankLive,
            },
            mock: {
              ...user.ranks.mock,
              school: schoolRankMock,
            },
          },
        };
      })
    );

    res.status(200).json({ message: "Users fetched successfully.", users: enhancedUsers });
  } catch (error) {
    console.error("Error fetching users:", error.message);
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};



const getSchoolRepresentativeDetails = async (req, res) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Authorization token is required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    // Fetch school details from Firebase Database using decoded token UID
    const schoolRef = ref(database, `schools/${decoded.uid}`);
    const snapshot = await get(schoolRef);

    if (!snapshot.exists()) {
      return res
        .status(404)
        .json({ message: "School representative not found." });
    }

    const schoolData = snapshot.val();

    // Reference to all students in gio-students
    const studentsRef = ref(database, "gio-students");
    const studentsSnapshot = await get(studentsRef);

    let totalPracticeTests = 0; // Mock test count
    let finalPracticeTests = 0; // Live test count

    if (studentsSnapshot.exists()) {
      studentsSnapshot.forEach((childSnapshot) => {
        const student = childSnapshot.val();

        if (
          student.schoolName &&
          student.schoolName.trim().toLowerCase() ===
          schoolData.schoolName.trim().toLowerCase()
        ) {
          const marks = student.marks || {};
          totalPracticeTests += marks.mock ? Object.keys(marks.mock).length : 0;
          finalPracticeTests += marks.live ? Object.keys(marks.live).length : 0;
        }
      });
    }

    res.status(200).json({
      message: "School representative details fetched successfully.",
      representative: {
        uid: decoded.uid,
        email: schoolData.email,
        schoolName: schoolData.schoolName,
        principalName: schoolData.principalName,
        role: schoolData.role || "school",
        createdAt: schoolData.createdAt || null,
      },
      practiceTestCounts: {
        totalPracticeTests,
        finalPracticeTests,
      },
    });
  } catch (error) {
    console.error(
      "Error fetching school representative details:",
      error.message
    );
    return res.status(500).json({
      message: "Failed to fetch school representative details",
      error: error.message,
    });
  }
};


// Define allowed subjects map

// Define allowed subjects map
const allowedSubjectsMap = {
  english: "English",
  mathematics: "Mathematics",
  mental_ability: "Mental_ability",
  science: "Science",
  social_science: "Social_Science",
};


// Import necessary Firebase functions the allowedSubjectsMap


// Backend function to get school subject marks
const getSchoolSubjectMarks = async (req, res) => {
  try {
    // Step 1: Validate Query Parameters
    const { schoolName } = req.query;
    if (!schoolName) {
      console.log("School name is missing in the request.");
      return res.status(400).json({ message: "School name is required." });
    }

    // Step 2: Verify School Existence
    const schoolRef = ref(database, `schools`);
    const schoolSnapshot = await get(schoolRef);

    if (!schoolSnapshot.exists()) {
      console.log("No schools found in the database.");
      return res.status(404).json({ message: "School not found." });
    }

    const schools = schoolSnapshot.val();
    const schoolEntry = Object.values(schools).find(
      (school) =>
        school.schoolName &&
        school.schoolName.trim().toLowerCase() === schoolName.trim().toLowerCase()
    );

    if (!schoolEntry) {
      console.log(`No matching school found for schoolName: ${schoolName}`);
      return res.status(403).json({
        message: "You are not authorized to access this school's data.",
      });
    }

    // Step 3: Fetch All Students Belonging to the School
    const studentsRef = ref(database, `gio-students`);
    const snapshot = await get(studentsRef);

    if (!snapshot.exists()) {
      console.log("No students found in the database for this school.");
      return res.status(200).json({
        message: "No students found in the database for this school.",
        subjectMarks: {
          mock: {},
          live: {},
        },
      });
    }

    const students = snapshot.val();
    console.log("Students fetched from the database.");
    console.log("Total Students Fetched:", Object.keys(students).length);

    const subjectMarksData = {
      mock: {},
      live: {},
    };

    // Step 4: Process Each Student
    Object.values(students).forEach((student) => {
      // Check if student belongs to the specified school
      const matchesSchool =
        student.schoolName &&
        student.schoolName.trim().toLowerCase() === schoolName.trim().toLowerCase();

      if (!matchesSchool) {
        console.log(`Skipping student: ${student.name} - School mismatch.`);
        return; // Skip students not belonging to the school
      }

      const subjectMarks = student.subjectMarks || {};
      const standard = student.standard;

      // Validate standard - accept strings like '7th', '9th'
      if (!standard || typeof standard !== "string") {
        console.warn(`Invalid or missing standard for student: ${student.name}`);
        return; // Skip students with invalid or missing standard
      }

      // Normalize the standard (e.g., '7th' -> '7')
      const standardNormalized = standard.trim().toLowerCase().replace(/\D/g, "");
      if (!standardNormalized) {
        console.warn(`Invalid standard format for student: ${student.name}`);
        return; // Skip students with invalid standard format
      }

      // Use the normalized standard (e.g., '7')
      const standardKey = standardNormalized;
      console.log(`Processing student: ${student.name}, Standard: ${standardKey}`);

      // Initialize structures for the standard if not already present
      ["mock", "live"].forEach((type) => {
        if (!subjectMarksData[type][standardKey]) {
          subjectMarksData[type][standardKey] = {};
          Object.values(allowedSubjectsMap).forEach((subject) => {
            subjectMarksData[type][standardKey][subject] = [];
          });
          console.log(`Initialized subjectMarksData[${type}][${standardKey}]`);
        }

        if (subjectMarks[type]) {
          Object.entries(subjectMarks[type]).forEach(([subject, marks]) => {
            if (allowedSubjectsMap[subject.toLowerCase()]) {
              const properSubject = allowedSubjectsMap[subject.toLowerCase()];
              console.log(`Processing subject: ${properSubject}, Student: ${student.name}, Marks: ${marks.score}`);

              // Ensure that marks.score exists and is a number
              if (marks.score !== undefined && typeof marks.score === 'number') {
                subjectMarksData[type][standardKey][properSubject].push({
                  studentName: student.name,
                  marks: marks.score, // Assuming 'marks' has 'score' property
                });
              } else {
                console.warn(`Invalid marks for student: ${student.name}, subject: ${subject}`);
              }
            } else {
              console.warn(`Unrecognized subject '${subject}' in student: ${student.name}`);
            }
          });
        }
      });
    });

    // Log the subjectMarksData before sorting
    console.log("Subject Marks Data Before Sorting:", JSON.stringify(subjectMarksData, null, 2));

    // Step 5: Sort Students Within Each Subject by Marks Descending
    ["mock", "live"].forEach((type) => {
      Object.keys(subjectMarksData[type]).forEach((standard) => {
        Object.keys(subjectMarksData[type][standard]).forEach((subject) => {
          subjectMarksData[type][standard][subject].sort((a, b) => b.marks - a.marks);
        });
      });
    });

    // Log the subjectMarksData after sorting
    console.log("Subject Marks Data After Sorting:", JSON.stringify(subjectMarksData, null, 2));

    // Step 6: Send the Response
    res.status(200).json({
      message: "School-wide standard-wise subject marks fetched successfully.",
      subjectMarks: subjectMarksData,
    });
  } catch (error) {
    console.error("Error fetching school subject marks:", error.message);
    res.status(500).json({
      message: "Failed to fetch school subject marks.",
      error: error.message,
    });
  }
};


/**
 * getSchoolRankings:
 * Fetches and returns the rankings of all students within a specified school and test type.
 * Query Parameters:
 * - schoolName: Name of the school.
 * - type: Test type ('mock' or 'live').
 */
const getSchoolRankings = async (req, res) => {
  
  try {
    const { schoolName, type } = req.query;

    // Validate query parameters
    if (!schoolName || !type) {
      return res.status(400).json({
        message: "Both 'schoolName' and 'type' (mock/live) query parameters are required.",
      });
    }

    if (!["mock", "live"].includes(type)) {
      return res.status(400).json({
        message: "Invalid test type. Must be 'mock' or 'live'.",
      });
    }

    // Step 1: Fetch all students belonging to the specified school
    const studentsRef = ref(database, "gio-students");
    const snapshot = await get(studentsRef);

    if (!snapshot.exists()) {
      return res.status(404).json({
        message: `No students found in the database.`,
        rankings: [],
      });
    }

    const allStudents = snapshot.val();

    // Filter students belonging to the specified school
    const schoolStudents = Object.values(allStudents).filter(
      (student) =>
        student.schoolName &&
        student.schoolName.trim().toLowerCase() === schoolName.trim().toLowerCase()
    );

    if (schoolStudents.length === 0) {
      return res.status(404).json({
        message: `No students found for the school '${schoolName}'.`,
        rankings: [],
      });
    }

    // Step 2: Calculate total marks and latest timestamp for each student
    const rankingData = schoolStudents.map((student) => {
      let totalMarks = 0;
      let latestTimestamp = null;

      if (student.marks && student.marks[type]) {
        Object.values(student.marks[type]).forEach((test) => {
          if (test.score !== undefined && test.timestamp) {
            totalMarks += test.score;
            const testTime = new Date(test.timestamp);
            if (
              !latestTimestamp ||
              testTime.getTime() > latestTimestamp.getTime()
            ) {
              latestTimestamp = testTime;
            }
          }
        });
      }

      return {
        uid: student.uid,
        name: student.name,
        totalMarks,
        timestamp: latestTimestamp ? latestTimestamp.toISOString() : null,
      };
    });

    // Step 3: Sort students by totalMarks descending, then by timestamp ascending
    rankingData.sort((a, b) => {
      if (b.totalMarks !== a.totalMarks) {
        return b.totalMarks - a.totalMarks; // Higher marks first
      } else {
        // Earlier timestamp first
        if (a.timestamp && b.timestamp) {
          return new Date(a.timestamp) - new Date(b.timestamp);
        } else if (a.timestamp) {
          return -1; // a has timestamp, b doesn't
        } else if (b.timestamp) {
          return 1; // b has timestamp, a doesn't
        } else {
          return 0; // Both have no timestamp
        }
      }
    });

    // Step 4: Assign ranks and categories
    const rankedStudents = rankingData.map((student, index) => {
      const rank = index + 1;
      const category = getCategoryFromRank(rank);

      return {
        uid: student.uid,
        name: student.name,
        totalMarks: student.totalMarks,
        rank,
        category,
      };
    });

    // Step 5: Save the rankings back to the database (optional)
    // This step is optional and depends on whether you want to store the rankings.
    // If you prefer real-time calculations, you can skip this step.

    res.status(200).json({
      message: `School rankings for '${schoolName}' in '${type}' tests fetched successfully.`,
      rankings: rankedStudents,
    });
  } catch (error) {
    console.error("Error fetching school rankings:", error.message);
    res.status(500).json({
      message: "Failed to fetch school rankings.",
      error: error.message,
    });
  }
};



module.exports = {
  registerSchool,
  loginSchool,
  bulkUploadStudents,
  fetchUsersBySchool,
  getSchoolRepresentativeDetails, getSchoolSubjectMarks,
  getSchoolRankings
};
