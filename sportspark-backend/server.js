// 1. FIRST - Check if you have the organizer routes in your main app file
// In your app.js or server.js, make sure you have:

import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import organizerRoutes from "./routes/organizer.js";
import db from "./db.js";
import verifyToken from "./middlewares/verifyToken.js";

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/organizer", organizerRoutes); // THIS LINE MUST EXIST

app.listen(5000, () => {
  console.log("Server running on port 5000");
});


const router = express.Router();

// Category mapping for your sport_category_id
const categoryMap = {
  1: 'Football',
  2: 'Basketball', 
  3: 'Tennis',
  4: 'Running',
  5: 'Volleyball',
  6: 'Cricket'
};

const reverseCategoryMap = {
  'Football': 1,
  'Basketball': 2,
  'Tennis': 3,
  'Running': 4,
  'Volleyball': 5,
  'Cricket': 6
};

// Get organizer dashboard data
router.get("/dashboard", verifyToken, (req, res) => {
  console.log("Organizer dashboard route hit, userId:", req.userId); // Debug log
  
  const organizerId = req.userId;
  
  // First check if user exists and is organizer
  const userQuery = "SELECT role, name FROM users WHERE id = ?";
  
  db.query(userQuery, [organizerId], (err, userResult) => {
    if (err) {
      console.error("User query error:", err);
      return res.status(500).json({ message: "Database error checking user" });
    }
    
    if (userResult.length === 0) {
      console.log("User not found:", organizerId);
      return res.status(404).json({ message: "User not found" });
    }
    
    const user = userResult[0];
    console.log("User found:", user); // Debug log
    
    if (user.role !== 'organizer') {
      console.log("User is not organizer, role:", user.role);
      return res.status(403).json({ message: "Access denied. Organizer role required." });
    }
    
    // Get organizer's events using your existing table structure
    const eventsQuery = `
      SELECT 
        e.id,
        e.title as event_name,
        e.sport_category_id,
        e.date as event_date,
        e.location,
        e.description,
        e.capacity as max_participants,
        e.image_url,
        COUNT(r.id) as registration_count 
      FROM events e 
      LEFT JOIN registrations r ON e.id = r.event_id 
      WHERE e.organizer_id = ? 
      GROUP BY e.id, e.title, e.sport_category_id, e.date, e.location, e.description, e.capacity, e.image_url
      ORDER BY e.updated_at DESC
    `;
    
    db.query(eventsQuery, [organizerId], (err, eventsResult) => {
      if (err) {
        console.error("Events query error:", err);
        return res.status(500).json({ message: "Database error fetching events" });
      }
      
      console.log("Events found:", eventsResult.length); // Debug log
      
      // Transform events to match frontend expectations
      const transformedEvents = eventsResult.map(event => ({
        id: event.id.toString(),
        event_name: event.event_name,
        category: categoryMap[event.sport_category_id] || 'Unknown',
        event_date: event.event_date,
        location: event.location,
        description: event.description,
        max_participants: event.max_participants,
        registration_count: parseInt(event.registration_count) || 0,
        image_url: event.image_url
      }));
      
      // Get total registrations
      const totalRegistrationsQuery = `
        SELECT COUNT(r.id) as totalRegistrations 
        FROM registrations r 
        JOIN events e ON r.event_id = e.id 
        WHERE e.organizer_id = ?
      `;
      
      db.query(totalRegistrationsQuery, [organizerId], (err, totalResult) => {
        if (err) {
          console.error("Total registrations error:", err);
          return res.status(500).json({ message: "Database error fetching total registrations" });
        }
        
        const response = {
          name: user.name,
          events: transformedEvents,
          totalRegistrations: totalResult[0]?.totalRegistrations || 0,
          totalEvents: transformedEvents.length
        };
        
        console.log("Sending response:", response); // Debug log
        res.json(response);
      });
    });
  });
});

// Create new event
router.post("/create-event", verifyToken, (req, res) => {
  console.log("Create event route hit"); // Debug log
  console.log("Request body:", req.body); // Debug log
  
  const organizerId = req.userId;
  const { 
    event_name, 
    category, 
    event_date, 
    location, 
    description, 
    max_participants,
    image_url 
  } = req.body;
  
  // Validate required fields
  if (!event_name || !category || !event_date || !location) {
    return res.status(400).json({ 
      message: "Event name, category, date, and location are required" 
    });
  }
  
  // Get sport_category_id from category name
  const sport_category_id = reverseCategoryMap[category];
  if (!sport_category_id) {
    return res.status(400).json({ message: "Invalid category: " + category });
  }
  
  // Insert using your existing column names
  const insertQuery = `
    INSERT INTO events 
    (organizer_id, title, sport_category_id, date, location, description, capacity, image_url, status, updated_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', NOW())
  `;
  
  const values = [
    organizerId,
    event_name,
    sport_category_id,
    event_date,
    location,
    description || null,
    max_participants || null,
    image_url || null
  ];
  
  db.query(insertQuery, values, (err, result) => {
    if (err) {
      console.error("Create event error:", err);
      return res.status(500).json({ message: "Database error creating event: " + err.message });
    }
    
    console.log("Event created successfully:", result.insertId); // Debug log
    res.json({
      success: true,
      message: "Event created successfully",
      eventId: result.insertId
    });
  });
});

// Delete event
router.delete("/delete-event/:eventId", verifyToken, (req, res) => {
  console.log("Delete event route hit:", req.params.eventId); // Debug log
  
  const organizerId = req.userId;
  const { eventId } = req.params;
  
  // Check if the event belongs to this organizer
  const checkQuery = "SELECT id FROM events WHERE id = ? AND organizer_id = ?";
  
  db.query(checkQuery, [eventId, organizerId], (err, result) => {
    if (err) {
      console.error("Ownership check error:", err);
      return res.status(500).json({ message: "Database error checking event ownership" });
    }
    
    if (result.length === 0) {
      return res.status(403).json({ message: "Event not found or access denied" });
    }
    
    // Delete registrations first, then event
    const deleteRegistrationsQuery = "DELETE FROM registrations WHERE event_id = ?";
    
    db.query(deleteRegistrationsQuery, [eventId], (err) => {
      if (err) {
        console.error("Delete registrations error:", err);
        return res.status(500).json({ message: "Error deleting registrations" });
      }
      
      const deleteEventQuery = "DELETE FROM events WHERE id = ?";
      
      db.query(deleteEventQuery, [eventId], (err) => {
        if (err) {
          console.error("Delete event error:", err);
          return res.status(500).json({ message: "Error deleting event" });
        }
        
        console.log("Event deleted successfully:", eventId); // Debug log
        res.json({
          success: true,
          message: "Event deleted successfully"
        });
      });
    });
  });
});

export default router;