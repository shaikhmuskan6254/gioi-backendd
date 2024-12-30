const express = require("express");
const router = express.Router();

const upload = require("../middleware/multer");
const {
  registerSchool,
  loginSchool,
  bulkUploadStudents,
  fetchUsersBySchool,
  getSchoolRepresentativeDetails,getSchoolSubjectMarks,getSchoolRankings
} = require("../controllers/schoolController");

// School authentication routes
router.post("/register", registerSchool);
router.post("/login", loginSchool);

// Bulk upload route
router.post("/bulk-upload", upload.single("file"), bulkUploadStudents);

router.get("/representative", getSchoolRepresentativeDetails);
// GET ALL STUDENTS DETAILS ON VIEW
router.get("/fetch-users", fetchUsersBySchool);

// Get school subject marks (protected route)
router.get("/subject-marks", getSchoolSubjectMarks);

router.get("/rankings", getSchoolRankings);
// router.put("update-ranaking")

module.exports = router;
