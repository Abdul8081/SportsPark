import express from "express";
import db from "../db.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();


router.post("/register-event", verifyToken, (req, res) => {
  const userId = req.userId;
  const { eventId } = req.body;

  if (!eventId) {
    return res.status(400).json({ message: "eventId is required" });
  }

  const insertQuery = "INSERT INTO registrations (user_id, event_id) VALUES (?, ?)";
  db.query(insertQuery, [userId, eventId], (err) => {
    if (err) {
      console.error("Register event error:", err);
      return res.status(500).json({ message: "Database error while registering" });
    }
    res.json({ success: true, message: "Event registered successfully" });
  });
});


router.get("/", verifyToken, (req, res) => {
  const userId = req.userId;  // Assuming your verifyToken sets req.userId

  const userQuery = "SELECT name FROM users WHERE id = ?";
  const countQuery = "SELECT COUNT(*) AS registeredCount FROM registrations WHERE user_id = ?";
  const eventsQuery = "SELECT * FROM events";

  db.query(userQuery, [userId], (err, userResult) => {
    if (err) {
      console.error("User query error:", err);
      return res.status(500).json({ message: "Database error fetching user" });
    }
    db.query(countQuery, [userId], (err, countResult) => {
      if (err) {
        console.error("Count query error:", err);
        return res.status(500).json({ message: "Database error fetching registration count" });
      }
      db.query(eventsQuery, (err, eventsResult) => {
        if (err) {
          console.error("Events query error:", err);
          return res.status(500).json({ message: "Database error fetching events" });
        }

        res.json({
          name: userResult[0]?.name || "User",
          registeredCount: countResult[0]?.registeredCount || 0,
          events: eventsResult
        });
      });
    });
  });
});

export default router;  // <---- Make sure this line is here!
