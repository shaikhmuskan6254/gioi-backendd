const { database } = require("../config/firebase-config");

const { ref, set, get, remove,update } = require("firebase/database");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const bcrypt = require("bcrypt"); // Assuming bcrypt is used for password hashing
const { type } = require("os");

const updateUserProfile = async (req, res) => {
  const { uid, deleteAccount } = req.body; // Include deleteAccount flag from frontend

  if (!uid) {
    return res.status(400).json({ message: "Student UID is required." });
  }

  try {
    // Reference to the student's data in the database
    const userRef = ref(database, `gio-students/${uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      return res
        .status(404)
        .json({ message: "Student not found in the database." });
    }

    // Handle Deletion Logic
    if (deleteAccount) {
      await remove(userRef); // Deletes the student record
      return res
        .status(200)
        .json({ message: "Student account deleted successfully." });
    }

    // Handle Update Logic
    const {
      name,
      username,
      password,
      confirmPassword,
      PhoneNumber,
      teacherPhoneNumber,
      whatsappNumber,
      standard,
      schoolName,
      country,
      state,
      city,
    } = req.body;

    // Validate password match (if provided)
    if (password && confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    const userData = snapshot.val(); // Existing student data

    // Update fields if provided, else retain existing data
    const updatedData = {
      ...userData,
      name: name || userData.name,
      username: username || userData.username,
      PhoneNumber: PhoneNumber || userData.PhoneNumber,
      teacherPhoneNumber: teacherPhoneNumber || userData.teacherPhoneNumber,
      whatsappNumber: whatsappNumber || userData.whatsappNumber,
      standard: standard || userData.standard,
      schoolName: schoolName || userData.schoolName,
      country: country || userData.country,
      state: state || userData.state,
      city: city || userData.city,
    };

    // If password is being updated, hash it
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updatedData.password = hashedPassword;
    }

    // Save updated data in the database
    await set(userRef, updatedData);

    res.status(200).json({
      message: "Student profile updated successfully.",
      user: updatedData,
    });
  } catch (error) {
    console.error("Error in student profile update/delete:", error.message);
    res.status(500).json({
      message: "Failed to update/delete student profile.",
      error: error.message,
    });
  }
};

// Register User
const registerUser = async (req, res) => {
  const {
    name, // Added name
    username,
    password,
    confirmPassword,
    PhoneNumber,
    teacherPhoneNumber,
    whatsappNumber,
    standard,
    schoolName,
    country,
    state,
    city,
  } = req.body;

  // Validate required fields
  if (!name || !username || !password || !PhoneNumber) {
    return res.status(400).json({
      message: "Name, username, password, and phone number are required",
    });
  }

  // Validate password and confirmPassword match
  if (password !== confirmPassword) {
    return res.status(400).json({
      message: "Password and confirm password do not match",
    });
  }

  try {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10); // Hash with salt rounds

    // Generate a unique ID for the user
    const uid = uuidv4();

    // Save user details to the Realtime Database, storing the hashed password
    const userRef = ref(database, `gio-students/${uid}`);
    try {
      await set(userRef, {
        uid, // Save the UID
        name, // Save the name
        username, // Storing the username
        password: hashedPassword, // Storing the hashed password
        PhoneNumber,
        teacherPhoneNumber,
        whatsappNumber,
        standard,
        schoolName,
        country,
        state,
        city,
        paymentStatus: "unpaid",
        testCompleted: false,
        ranks: {},
        createdAt: new Date().toISOString(),
      });
    } catch (dbError) {
      console.error("Error writing user details to the database:", dbError);
      return res.status(500).json({
        message: "Failed to save user details to the database.",
        error: dbError.message,
      });
    }

    // Generate JWT token for the user after registration
    const token = jwt.sign(
      { uid, username, name }, // Include UID, username, and name in the JWT payload
      process.env.JWT_SECRET_KEY, // Secret key for signing the token
      { expiresIn: "1d" } // Expiration time for the token (1 day)
    );

    res.status(201).json({
      message: "User registered successfully",
      uid, // Include UID in the response
      username, // Include username in the response
      name, // Include name in the response
      token, // Send the JWT token to the frontend
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      message: "Failed to register user",
      error: error.message,
    });
  }
};

// Login User
const loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "Username and password are required",
    });
  }

  try {
    // Look for the user by username in the database
    const userRef = ref(database, "gio-students");
    const snapshot = await get(userRef);

    let user = null;
    snapshot.forEach((childSnapshot) => {
      if (childSnapshot.val().username === username) {
        user = childSnapshot.val(); // Found the user by username
      }
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    // Compare the entered password with the stored hashed password
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    // Generate JWT token for the user
    const token = jwt.sign(
      { uid: user.uid, username: user.username },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      username: user.username,
      token,
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({
      message: "Failed to log in user",
      error: error.message,
    });
  }
};

// Get User Profile
const getUserProfile = async (req, res) => {
  const user = req.user; // Extract user information from middleware (e.g., authentication middleware)
  const username = user?.username; // Ensure username exists

  if (!username) {
    return res.status(400).json({
      message: "Username is required for authentication.",
    });
  }

  try {
    // Fetch the database reference
    const userRef = ref(database, "gio-students");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      return res.status(404).json({
        message: "No users found in the database.",
      });
    }

    // Find the user profile based on the username
    const userProfile = Object.values(snapshot.val()).find(
      (userData) => userData.username === username
    );

    if (!userProfile) {
      return res.status(404).json({
        message: "User not found in the database.",
      });
    }

    res.status(200).json({
      message: "User profile fetched successfully.",
      user: userProfile,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({
      message: "Failed to fetch user profile.",
      error: error.message,
    });
  }
};

const updatePaymentStatus = async (req, res) => {
  const { paymentStatus } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(400).json({ message: "User data not found." });
  }

  try {
    const userRef = ref(database, `gio-students/${user.uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      return res
        .status(400)
        .json({ message: "User not found in the database." });
    }

    const userData = snapshot.val();

    const updates = {
      ...userData,
      paymentStatus,
    };

    // If paymentStatus indicates quiz completion or a new cycle, reset testCompleted
    if (paymentStatus === "quiz_attempted") {
      updates.testCompleted = true; // Mark as completed
    } else if (paymentStatus === "unpaid") {
      updates.testCompleted = false; // Reset for the next attempt
    }

    await set(userRef, updates);

    res
      .status(200)
      .json({ message: "Payment status and test state updated successfully." });
  } catch (error) {
    console.error("Error updating payment status:", error);
    res.status(500).json({ message: "Failed to update payment status." });
  }
};

// Load Mock Ranks JSON
let globalMockRanksData, countryMockRanksData, stateMockRanksData;

try {
  globalMockRanksData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../public/mockranks/globalrange.json"),
      "utf8"
    )
  );
  countryMockRanksData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../public/mockranks/countryrange.json"),
      "utf8"
    )
  );
  stateMockRanksData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../public/mockranks/staterange.json"),
      "utf8"
    )
  );
} catch (error) {
  console.error("Error loading mock ranks JSON:", error.message);
  process.exit(1);
}

// Load JSON files for live rank data
let globalRanksData, countryRanksData, stateRanksData;

try {
  globalRanksData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../public/liveranks/globalrange.json"),
      "utf8"
    )
  );
} catch (error) {
  console.error("Error loading globalrange.json:", error.message);
  process.exit(1);
}

try {
  countryRanksData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../public/liveranks/countryrange.json"),
      "utf8"
    )
  );
} catch (error) {
  console.error("Error loading countryrange.json:", error.message);
  process.exit(1);
}

try {
  stateRanksData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../public/liveranks/staterange.json"),
      "utf8"
    )
  );
} catch (error) {
  console.error("Error loading staterange.json:", error.message);
  process.exit(1);
}
// Helper function to calculate rank and category
// Helper function to calculate rank and category
const getRankAndCategory = (score, jsonData, maxScore) => {
  score = Number(score); // Ensure score is a number

  // If the score is the maximum possible score, assign rank 1
  if (score === maxScore) {
    return { rank: 1, category: "Gold" };
  }

  // Find the matching score entry in the JSON
  const entry = jsonData.find((item) => item.score === score);

  if (!entry) {
    return { rank: "Unranked", category: "Unranked" }; // No matching entry
  }

  const [start, end] = entry.rankRange.split(" to ").map(Number);
  const randomRank = Math.floor(Math.random() * (end - start + 1)) + start;

  return { rank: randomRank, category: entry.category };
};

 
/*************************************************************
 * Allowed subjects mapping (lowercase to proper casing)
 *************************************************************/
// controllers/gioController.js

/*************************************************************
 * Allowed subjects mapping (lowercase to proper casing)
 *************************************************************/
const allowedSubjectsMap = {
  "english": "English",
  "mathematics": "Mathematics",
  "mental_ability": "Mental_ability", // Lowercase key to match frontend
  "science": "Science",
  "social_science": "Social_Science",
};

/*************************************************************
 * saveQuizMarks:
 * Main function to save quiz marks.
 *************************************************************/
const saveQuizMarks = async (req, res) => {
  const { uid } = req.user;
  const { score, total, type, selectedAnswers, questions } = req.body;

  // 1) Basic validations
  if (!uid) {
    return res.status(400).json({ message: "User UID is required." });
  }

  if (
    score === undefined ||
    total === undefined ||
    !type ||
    !selectedAnswers ||
    !questions ||
    !Array.isArray(selectedAnswers) ||
    !Array.isArray(questions)
  ) {
    return res.status(400).json({
      message: "Score, total, type, selectedAnswers (array), and questions (array) are required.",
    });
  }

  if (type !== "mock" && type !== "live") {
    return res.status(400).json({ message: "Invalid test type. Must be 'mock' or 'live'." });
  }

  try {
    // 2) Generate a test ID
    const scoreNum = Number(score);
    const totalNum = Number(total);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const testId = `test-${timestamp}`;

    // 3) Fetch user data
    const userSnapshot = await get(ref(database, `gio-students/${uid}`));
    if (!userSnapshot.exists()) {
      return res.status(404).json({ message: "User not found." });
    }
    const userData = userSnapshot.val();
    const schoolName = userData.schoolName || "Unknown School";
    const userName = userData.name || "Unknown";
    const standard = userData.standard;

    if (!standard) {
      return res.status(400).json({ message: "User standard is not defined." });
    }

    // 4) Calculate subject-wise score using the valid subjects
    const subjectScores = calculateSubjectMarks(questions, selectedAnswers);
    console.log(`Saving subject marks => uid=${uid}, type=${type}`, subjectScores);
    // 5) Save the attempt in /marks/<type>/<testId>
    const marksRef = ref(database, `gio-students/${uid}/marks/${type}/${testId}`);
    await set(marksRef, {
      score: scoreNum,
      total: totalNum,
      subjectScores,
      timestamp,
    });

    // 6) Overwrite subject-wise marks in the user's profile
    await saveSubjectMarks(uid, subjectScores, type);

    // 7) If live => do optional ranking + certificate
    if (type === "live") {
      const maxScore = totalNum;
      await updateUserRankings(uid, scoreNum, type, maxScore);

      if (scoreNum === maxScore) {
        const certificateCode = `GIO-GQC-${Math.floor(1000 + Math.random() * 9000)}`;
        const certificateData = {
          code: certificateCode,
          name: userName,
          schoolName,
          timestamp: new Date().toISOString(),
        };

        await set(ref(database, `gio-students/${uid}/certificateCodes/${certificateCode}`), certificateData);
        await set(ref(database, `certificateCodes/${certificateCode}`), {
          ...certificateData,
          createdAt: certificateData.timestamp,
          type: "GQC",
        });

        return res.status(200).json({
          message: "Live test marks saved + certificate generated successfully.",
          certificateCode,
          name: userName,
          schoolName,
        });
      }
    }

    // 8) Return success
    return res.status(200).json({
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} test marks saved successfully.`,
      subjectMarks: subjectScores,
    });
  } catch (error) {
    console.error("Error saving marks:", error.message);
    return res.status(500).json({ message: "Failed to save test marks.", error: error.message });
  }
};

/*************************************************************
 * calculateSubjectMarks:
 * Returns { English:{score, total}, ... }
 *************************************************************/
function calculateSubjectMarks(questions, selectedAnswers) {
  const subjectScores = {
    English: { score: 0, total: 0 },
    Mathematics: { score: 0, total: 0 },
    Mental_ability: { score: 0, total: 0 }, // Backend format remains unchanged
    Science: { score: 0, total: 0 },
    Social_Science: { score: 0, total: 0 },
  };
  

  // Iterate through each question to calculate scores
  questions.forEach((question, index) => {
    let { subject, answer } = question;
    const userAnswer = selectedAnswers[index];

    // Normalize subject name: lowercase
    const subjectLower = subject.toLowerCase(); // Converts input subject to lowercase
    const mappedSubject = allowedSubjectsMap[subjectLower]; // Maps to backend subject key
    

    if (mappedSubject && subjectScores.hasOwnProperty(mappedSubject)) {
      // Each question is worth 4 points => so total += 4
      subjectScores[mappedSubject].total += 4;

      // +4 if correct, -1 if incorrect, but prevent negative score
      if (userAnswer === answer) {
        subjectScores[mappedSubject].score += 4;
      } else if (userAnswer) {
        subjectScores[mappedSubject].score -= 1;
        if (subjectScores[mappedSubject].score < 0) {
          subjectScores[mappedSubject].score = 0;
        }
      }
    } else {
      console.warn(`Unrecognized subject '${subject}' in question #${index + 1}.`);
    }
  });

  return subjectScores;
}

/*************************************************************
 * saveSubjectMarks: Updates only the specified test type with subject scores
 *************************************************************/
async function saveSubjectMarks(uid, subjectScores, type) {
  console.log(`Saving subject marks => uid=${uid}, type=${type}`, subjectScores);

  const allowedSubjectsMap = {
    "english": "English",
    "mathematics": "Mathematics",
    "mental_ability": "Mental_ability",
    "science": "Science",
    "social_science": "Social_Science",
  };

  const updatedTypeSubjectMarks = {};

  // Map and normalize subject names
  Object.entries(subjectScores).forEach(([sub, scoreObj]) => {
    const subLower = sub.toLowerCase();
    const mappedSubject = allowedSubjectsMap[subLower];
    if (mappedSubject) {
      updatedTypeSubjectMarks[mappedSubject] = scoreObj;
    } else {
      console.warn(`Skipping invalid subject: ${sub}`);
    }
  });

  // Ensure all allowed subjects exist, even if no score was recorded
  Object.values(allowedSubjectsMap).forEach((properSub) => {
    if (updatedTypeSubjectMarks[properSub] === undefined) {
      updatedTypeSubjectMarks[properSub] = { score: 0, total: 0 };
    }
  });

  try {
    if (!["mock", "live"].includes(type)) {
      throw new Error(`Invalid test type '${type}'. Must be 'mock' or 'live'.`);
    }

    const subjectMarksRef = ref(database, `gio-students/${uid}/subjectMarks`);
    const updatedData = { [type]: updatedTypeSubjectMarks };

    await update(subjectMarksRef, updatedData);

    console.log(`Subject marks updated for type '${type}' =>`, updatedData);
  } catch (error) {
    console.error("Error updating subject marks:", error.message);
    throw error; // Re-throw to be handled by the caller
  }
}


/*************************************************************
 * getUserSubjectMarks:
 * Controller to fetch user's subject marks along with their standard.
 *************************************************************/
const getUserSubjectMarks = async (req, res) => {
  const { uid } = req.user;

  // Validate UID
  if (!uid) {
    console.warn("UID not found in req.user");
    return res.status(400).json({ message: "User UID is required." });
  }

  try {
    console.log(`Fetching subject marks for UID: ${uid}`);
    
    // Fetch subjectMarks
    const marksSnapshot = await get(ref(database, `gio-students/${uid}/subjectMarks`));
    
    if (!marksSnapshot.exists()) {
      console.warn(`Subject marks not found for UID: ${uid}`);
      return res.status(404).json({ message: "Subject marks not found." });
    }

    const marksData = marksSnapshot.val();
    console.log("Fetched marksData:", marksData);

    // Validate structure for mock and live
    if (
      !marksData.mock ||
      !marksData.live ||
      typeof marksData.mock !== "object" ||
      typeof marksData.live !== "object"
    ) {
      console.warn(`Invalid subjectMarks structure for UID: ${uid}`);
      return res.status(500).json({ message: "Invalid subject marks data format." });
    }

    // Fetch standard
    const userSnapshot = await get(ref(database, `gio-students/${uid}`));
    if (!userSnapshot.exists()) {
      console.warn(`User data not found for UID: ${uid}`);
      return res.status(404).json({ message: "User data not found." });
    }

    const userData = userSnapshot.val();
    const standard = userData.standard || "Unknown";

    res.status(200).json({ standard, subjectMarks: marksData });
  } catch (error) {
    console.error("Error fetching subject marks:", error.message);
    return res.status(500).json({
      message: "Failed to fetch subject marks.",
      error: error.message,
    });
  }
};







const updateUserRankings = async (uid, score, type, maxScore) => {
  let globalData, countryData, stateData;

  // Select ranking JSON based on type
  if (type === "mock") {
    globalData = globalMockRanksData;
    countryData = countryMockRanksData;
    stateData = stateMockRanksData;
  } else if (type === "live") {
    globalData = globalRanksData;
    countryData = countryRanksData;
    stateData = stateRanksData;
  } else {
    throw new Error("Invalid type. Must be 'mock' or 'live'.");
  }

  // Calculate global, country, and state ranks
  const globalRank = getRankAndCategory(score, globalData, maxScore);
  const countryRank = getRankAndCategory(score, countryData, maxScore);
  const stateRank = getRankAndCategory(score, stateData, maxScore);

  // Save global, country, and state rankings
  const rankingsRef = ref(database, `gio-students/${uid}/ranks/${type}`);
  await set(rankingsRef, {
    global: globalRank,
    country: countryRank,
    state: stateRank,
  });

  // Handle School-Based Ranking
  try {
    // Step 1: Fetch the student's school name
    const userSnapshot = await get(ref(database, `gio-students/${uid}`));
    if (!userSnapshot.exists()) {
      throw new Error("User not found while updating school rankings.");
    }
    const userData = userSnapshot.val();
    const schoolName = userData.schoolName;

    if (!schoolName) {
      throw new Error("User's schoolName is not defined.");
    }

    // Step 2: Fetch all students in the same school
    const studentsSnapshot = await get(ref(database, `gio-students`));
    if (!studentsSnapshot.exists()) {
      throw new Error("No students found in the database.");
    }
    const allStudents = studentsSnapshot.val();

    // Filter students belonging to the same school
    const schoolStudents = Object.values(allStudents).filter(
      (student) =>
        student.schoolName &&
        student.schoolName.trim().toLowerCase() === schoolName.trim().toLowerCase()
    );

    if (schoolStudents.length === 0) {
      throw new Error("No students found for the user's school.");
    }

    // Step 3: Calculate total marks and latest timestamp for each student
    const schoolRankingData = schoolStudents.map((student) => {
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

    // Step 4: Sort students by totalMarks descending, then by timestamp ascending
    schoolRankingData.sort((a, b) => {
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

    // Step 5: Assign ranks
    let currentRank = 1;
    let previousMarks = null;
    let previousTimestamp = null;

    for (let i = 0; i < schoolRankingData.length; i++) {
      const student = schoolRankingData[i];
      if (
        student.totalMarks !== previousMarks ||
        (student.totalMarks === previousMarks &&
          new Date(student.timestamp) > new Date(previousTimestamp))
      ) {
        currentRank = i + 1;
      }

      // Save the rank to the student's profile
      const studentRankRef = ref(
        database,
        `gio-students/${student.uid}/ranks/${type}/school`
      );
      await set(studentRankRef, {
        rank: currentRank,
        category: getCategoryFromRank(currentRank), // Define this function based on your categories
      });

      // Update previous marks and timestamp
      previousMarks = student.totalMarks;
      previousTimestamp = student.timestamp;
    }

    console.log(
      `School-based rankings updated successfully for type '${type}'.`
    );
  } catch (schoolRankError) {
    console.error(
      "Error updating school-based rankings:",
      schoolRankError.message
    );
    // Proceed without failing the entire ranking update
  }

  // Optional: Fetch and log the updated rankings to verify
  const updatedRankingsSnapshot = await get(rankingsRef);
};


// Get User Rankings
const getUserRankings = async (req, res) => {
  const { uid } = req.user; // Assuming `uid` is part of the authenticated user object
  const { type } = req.query;

  if (!uid) {
    return res.status(400).json({
      message: "User UID is required.",
    });
  }

  if (!type) {
    return res.status(400).json({
      message: "Query parameter 'type' is required.",
    });
  }

  try {
    const rankingsRef = ref(database, `gio-students/${uid}/ranks/${type}`);
    const snapshot = await get(rankingsRef);
    if (!snapshot.exists()) {
      return res.status(200).json({
        message: "No rankings available yet.",
        rankings: {
          global: { rank: "Unranked", category: "Unranked" },
          country: { rank: "Unranked", category: "Unranked" },
          state: { rank: "Unranked", category: "Unranked" },
        },
      });
    }

    const userRankings = snapshot.val();
    res.status(200).json({
      message: "Rankings fetched successfully.",
      rankings: userRankings,
    });
  } catch (error) {
    console.error("Error fetching rankings:", error.message);
    res.status(500).json({
      message: "Failed to fetch rankings.",
      error: error.message,
    });
  }
};

// Get Test Counts
const getTestCounts = async (req, res) => {
  try {
    const { uid } = req.user; // Assume authentication middleware attaches `req.user`

    if (!uid) {
      return res.status(400).json({ message: "User UID is required." });
    }

    // Reference to the user's marks in Firebase
    const marksRef = ref(database, `gio-students/${uid}/marks`);
    const snapshot = await get(marksRef);

    if (!snapshot.exists()) {
      return res.status(200).json({
        message: "No test data available.",
        mock: 0,
        live: 0,
      });
    }

    const marks = snapshot.val();

    // Count mock and live tests
    const mockCount = marks.mock ? Object.keys(marks.mock).length : 0;
    const liveCount = marks.live ? Object.keys(marks.live).length : 0;

    res.status(200).json({
      message: "Test counts fetched successfully.",
      mock: mockCount,
      live: liveCount,
    });
  } catch (error) {
    console.error("Error fetching test counts:", error.message);
    res.status(500).json({
      message: "Failed to fetch test counts.",
      error: error.message,
    });
  }
};
const getAllStudentsTestCounts = async (req, res) => {
  try {
    const { uid } = req.user; // The authenticated school user UID

    if (!uid) {
      return res.status(400).json({ message: "User UID is required." });
    }

    // Fetch the school name from the user's profile (this assumes you have the school in the user's data)
    const schoolName = req.user.schoolName; // Assuming `schoolName` is available in `req.user`

    // Reference to all students in the school
    const studentsRef = ref(database, `gio-students`);
    const snapshot = await get(studentsRef);

    if (!snapshot.exists()) {
      return res.status(200).json({
        message: "No students found for the school.",
        mock: 0,
        live: 0,
      });
    }

    const students = snapshot.val();

    let mockCount = 0;
    let liveCount = 0;

    // Loop through all students to count mock and live tests
    Object.values(students).forEach((student) => {
      if (student.marks && student.marks.mock) {
        mockCount += Object.keys(student.marks.mock).length;
      }
      if (student.marks && student.marks.live) {
        liveCount += Object.keys(student.marks.live).length;
      }
    });

    res.status(200).json({
      message: "Test counts fetched successfully.",
      mock: mockCount,
      live: liveCount,
    });
  } catch (error) {
    console.error("Error fetching all students' test counts:", error.message);
    res.status(500).json({
      message: "Failed to fetch test counts.",
      error: error.message,
    });
  }
};

const verifyCertificateCode = async (req, res) => {
  const { certificateCode } = req.body;

  if (!certificateCode) {
    return res.status(400).json({
      message: "Certificate code is required",
    });
  }

  try {
    // Reference to the 'gio-students' path in the database
    const studentsRef = ref(database, `gio-students`);
    const snapshot = await get(studentsRef);

    if (!snapshot.exists()) {
      return res.status(404).json({
        message: "No students found in the database",
      });
    }

    // Search for the certificate code within 'certificateCodes'
    let certificateData = null;
    let studentName = null;
    let schoolName = null;

    snapshot.forEach((childSnapshot) => {
      const studentData = childSnapshot.val();
      if (studentData.certificateCodes?.code === certificateCode) {
        certificateData = studentData.certificateCodes;
        studentName = studentData.name || "Unknown";
        schoolName = studentData.schoolName || "Unknown School"; // Retrieve school name
      }
    });

    if (!certificateData) {
      return res.status(404).json({
        message: `Certificate code not found: ${certificateCode}`,
      });
    }

    // Return the certificate details along with the name and school
    return res.status(200).json({
      message: "Certificate verified successfully",
      certificateCode: certificateData.code,
      name: studentName,
      schoolname: schoolName, // Include school name in the response
      rankings: certificateData.rankings,
      timestamp: certificateData.timestamp,
    });
  } catch (error) {
    console.error("Error verifying certificate code:", error);
    res.status(500).json({
      message: "Failed to verify certificate code",
      error: error.message,
    });
  }
};

// // Save Request Callback Details
const requestCallback = async (req, res) => {
  const { name, mobile, message } = req.body;

  if (!name || !mobile || !message) {
    return res
      .status(400)
      .json({ error: "Name, mobile, and message are required." });
  }

  try {
    // Save data to Firebase under "RequestCallback" node
    const callbackRef = ref(database, "RequestCallback/");
    const newRequestRef = push(callbackRef);

    await set(newRequestRef, {
      name,
      mobile,
      message,
      createdAt: new Date().toISOString(),
    });

    return res
      .status(200)
      .json({ message: "Request callback saved successfully!" });
  } catch (error) {
    console.error("Error saving request callback:", error);
    return res.status(500).json({ error: "Failed to save request callback." });
  }
};


/**
 * Returns the user's subject marks by summing
 * the data in "marks/mock" and "marks/live".
 *
 * However, since we remove old attempts,
 * there should only be the single newest test for each type,
 * so we won't get inflated scores.
 */
 // Your getUserSubjectMarks function
 
// handlers/getUserSubjectMarks.js

// const getUserSubjectMarks = async (req, res) => {
//   const { uid } = req.user;

//   if (!uid) {
//     return res.status(400).json({ message: "User UID is required." });
//   }

//   try {
//     // 1) Read from /gio-students/<uid>/subjectMarks
//     const userSnapshot = await get(ref(database, `gio-students/${uid}/subjectMarks`));
//     if (!userSnapshot.exists()) {
//       return res.status(404).json({ message: "Subject marks not found." });
//     }

//     const marksData = userSnapshot.val(); // Expected format: { mock: {...}, live: {...} }

//     // Validate that marksData is an object
//     if (typeof marksData !== 'object' || marksData === null) {
//       return res.status(500).json({ message: "Invalid subject marks data format." });
//     }

//     // 2) Accumulate into subjectMarks with { score, total }
//     const subjectMarks = { mock: {}, live: {} };

//     const accumulateScores = (type) => {
//       if (marksData[type] && typeof marksData[type] === 'object') {
//         Object.entries(marksData[type]).forEach(([testId, test]) => {
//           if (test && test.subjectScores && typeof test.subjectScores === 'object') {
//             Object.entries(test.subjectScores).forEach(([subject, val]) => {
//               if (allowedSubjects.includes(subject)) {
//                 if (!subjectMarks[type][subject]) {
//                   subjectMarks[type][subject] = { score: 0, total: 0 };
//                 }
//                 if (typeof val === 'object' && 'score' in val && 'total' in val) {
//                   subjectMarks[type][subject].score += val.score;
//                   subjectMarks[type][subject].total += val.total;
//                 } else if (typeof val === 'number') {
//                   // If only score is stored without total, define a default total
//                   subjectMarks[type][subject].score += val;
//                   subjectMarks[type][subject].total += 20; // Adjust default total as needed
//                 } else {
//                   console.warn(`Unexpected value format for subject "${subject}" in type "${type}":`, val);
//                 }
//               } else if (subject !== undefined) {
//                 console.warn(`Subject "${subject}" is not in allowedSubjects and will be ignored.`);
//               } else {
//                 console.warn(`Encountered undefined subject in type "${type}".`);
//               }
//             });
//           }
//         });
//       }
//     };

//     // Accumulate scores for both mock and live
//     accumulateScores("mock");
//     accumulateScores("live");

//     // 3) Ensure each allowed subject is present with { score, total }
//     allowedSubjects.forEach((subject) => {
//       if (!subjectMarks.mock[subject]) {
//         subjectMarks.mock[subject] = { score: 0, total: 0 };
//       }
//       if (!subjectMarks.live[subject]) {
//         subjectMarks.live[subject] = { score: 0, total: 0 };
//       }
//     });

//     // 4) Check if everything is zero => no attempts
//     const noMock = Object.values(subjectMarks.mock).every(
//       (val) => val.score === 0 && val.total === 0
//     );
//     const noLive = Object.values(subjectMarks.live).every(
//       (val) => val.score === 0 && val.total === 0
//     );
//     if (noMock && noLive) {
//       return res.status(404).json({ message: "No subject marks available." });
//     }

//     // 5) Send the response
//     return res.status(200).json({ subjectMarks });
//   } catch (error) {
//     console.error("Error fetching subject marks:", error.message);
//     return res.status(500).json({
//       message: "Failed to fetch subject marks.",
//       error: error.message,
//     });
//   }
// };


 



module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  saveQuizMarks,
  updatePaymentStatus,
  getUserRankings,
  getTestCounts,
  getAllStudentsTestCounts,
  verifyCertificateCode,
  updateUserProfile,
  updateUserRankings,
  requestCallback,
 getUserSubjectMarks
};
