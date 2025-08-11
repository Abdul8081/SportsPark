// routes/auth.js
import express from "express";
import jwt from "jsonwebtoken";
import db from "../db.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "5feb9ce216237212ae0fd18b39a30dac";

// Signup
router.post("/signup", (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const checkEmailSQL = "SELECT id FROM users WHERE email = ?";
  db.query(checkEmailSQL, [email], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (results.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";
    db.query(sql, [name, email, password, role], (err) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json({ success: true, message: "User registered successfully" });
    });
  });
});

// Login
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];

    // NOTE: Plaintext password comparison; replace with hashing in production
    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      token,
      role: user.role,
      name: user.name,
    });
  });
});

// Register event
router.post("/register-event", verifyToken, (req, res) => {
  const userId = req.userId;
  const { eventId } = req.body;
  
  console.log("=== REGISTRATION DEBUG ===");
  console.log("User ID:", userId, "Type:", typeof userId);
  console.log("Event ID:", eventId, "Type:", typeof eventId);
  console.log("Request body:", req.body);
  
  if (!eventId) {
    console.log("Error: eventId is missing");
    return res.status(400).json({ message: "eventId is required" });
  }

  if (!userId) {
    console.log("Error: userId is missing from token");
    return res.status(400).json({ message: "User ID not found in token" });
  }

  // First check if the event exists
  const checkEventQuery = "SELECT id, event_name, max_participants, registration_count FROM events WHERE id = ?";
  console.log("Checking if event exists with query:", checkEventQuery, [eventId]);
  
  db.query(checkEventQuery, [eventId], (eventErr, eventResults) => {
    if (eventErr) {
      console.error("Event check error:", eventErr);
      return res.status(500).json({ 
        message: "Database error while checking event",
        error: eventErr.message 
      });
    }

    console.log("Event check results:", eventResults);

    if (eventResults.length === 0) {
      console.log("Event not found for ID:", eventId);
      return res.status(404).json({ message: "Event not found" });
    }

    const event = eventResults[0];
    console.log("Found event:", event);
    
    // Check if event is full
    if (event.max_participants && event.registration_count >= event.max_participants) {
      console.log("Event is full");
      return res.status(400).json({ message: "Event is full" });
    }

    // Check if user is already registered
    const checkRegistrationQuery = "SELECT * FROM registrations WHERE user_id = ? AND event_id = ?";
    console.log("Checking existing registration:", checkRegistrationQuery, [userId, eventId]);
    
    db.query(checkRegistrationQuery, [userId, eventId], (checkErr, regResults) => {
      if (checkErr) {
        console.error("Registration check error:", checkErr);
        return res.status(500).json({ 
          message: "Database error while checking registration",
          error: checkErr.message 
        });
      }

      console.log("Registration check results:", regResults);

      if (regResults.length > 0) {
        console.log("User already registered");
        return res.status(400).json({ message: "You are already registered for this event" });
      }

      // Check if tables exist and user exists
      const checkUserQuery = "SELECT id FROM users WHERE id = ?";
      console.log("Checking if user exists:", checkUserQuery, [userId]);
      
      db.query(checkUserQuery, [userId], (userErr, userResults) => {
        if (userErr) {
          console.error("User check error:", userErr);
          return res.status(500).json({ 
            message: "Database error while checking user",
            error: userErr.message 
          });
        }

        console.log("User check results:", userResults);

        if (userResults.length === 0) {
          console.log("User not found for ID:", userId);
          return res.status(404).json({ message: "User not found" });
        }

        // Proceed with registration
        const insertQuery = "INSERT INTO registrations (user_id, event_id) VALUES (?, ?)";
        console.log("Inserting registration:", insertQuery, [userId, eventId]);
        
        db.query(insertQuery, [userId, eventId], (insertErr, insertResult) => {
          if (insertErr) {
            console.error("=== REGISTRATION INSERT ERROR ===");
            console.error("Full error object:", insertErr);
            console.error("Error code:", insertErr.code);
            console.error("Error number:", insertErr.errno);
            console.error("SQL Message:", insertErr.sqlMessage);
            console.error("SQL State:", insertErr.sqlState);
            console.error("Stack trace:", insertErr.stack);
            
            // Handle specific MySQL errors
            if (insertErr.code === 'ER_DUP_ENTRY') {
              return res.status(400).json({ message: "You are already registered for this event" });
            } else if (insertErr.code === 'ER_NO_REFERENCED_ROW_2') {
              return res.status(400).json({ message: "Invalid event or user reference" });
            } else if (insertErr.code === 'ER_NO_SUCH_TABLE') {
              return res.status(500).json({ message: "Registrations table does not exist" });
            } else {
              return res.status(500).json({ 
                message: "Database error while registering", 
                error: insertErr.sqlMessage || insertErr.message,
                code: insertErr.code
              });
            }
          }
          
          console.log("Registration successful:", insertResult);
          
          // Update event registration count
          const updateCountQuery = "UPDATE events SET registration_count = COALESCE(registration_count, 0) + 1 WHERE id = ?";
          db.query(updateCountQuery, [eventId], (updateErr) => {
            if (updateErr) {
              console.error("Update count error:", updateErr);
            }
            
            console.log("Registration process completed successfully");
            res.json({ success: true, message: "Event registered successfully" });
          });
        });
      });
    });
  });
});

export default router;
