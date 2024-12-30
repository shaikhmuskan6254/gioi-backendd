const debug = require("debug")("app:server");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const userRoutes = require("./routes/userRoutes"); // Import user routes
const adminRoutes = require("./routes/adminRoutes");
const scoolRoutes = require("./routes/schoolRoutes");
const cookieParser = require("cookie-parser");
const path = require("path");
const rateLimit =require( 'express-rate-limit');

const razorPayment = require("./routes/razorpayRoutes");
const coordinatorRoutes = require("./routes/coordinatorRoutes");
// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5002;

// Middleware
app.use(helmet()); // Adds security headers
const corsOptions = {
  origin: "*", // Allow all origins
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS", // Allow all methods
  allowedHeaders:
    "Origin, X-Requested-With, Content-Type, Accept, Authorization", // Allow all headers
  credentials: true, // Allow credentials
};
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 100 requests per windowMs
  message: "Too many requests, please try again later.",
});

// Apply global limiter to all requests
app.use(globalLimiter);

// Apply CORS middleware
app.use(cors(corsOptions));

// Preflight request handling
app.options("*", cors(corsOptions));

app.use(cookieParser()); // Enables cookie parsing for authentication tokens
app.use(bodyParser.json()); // Parses JSON requests
app.use(bodyParser.urlencoded({ extended: true })); // Parses URL-encoded data

// Serve static files from the public folder
app.use("/static", express.static(path.join(__dirname, "public")));

// Define API routes
app.use("/api/gio", userRoutes); // Use the userRoutes for "/api/gio" path
app.use("/api/payment", razorPayment); // Use the razorPayment
app.use("/api/admin", adminRoutes); // Use the adminRoutes for "/api/admin" path
app.use("/api/school", scoolRoutes); // Use the scoolRoute for "/api/school
app.use("/api/coordinator", coordinatorRoutes); // Use the teacher

// Route to serve JSON files

// Start the server

app.listen(PORT, () => {
  debug(`Server is running on http://localhost:${PORT}`);
});

app.get("/", (req, res) => {
  res.send("Server is running");
});
