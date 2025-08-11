// routes/organizer.js - Updated to match your existing database schema
import express from "express";
import db from "../db.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();

// Category mapping for your sport_category_id
const categoryMap = {
  1: 'Football',
  2: 'Basketball', 
  3: 'Tennis',
  4: 'Running',
  5: 'Volleyball',
  6: 'Cricket'
  // Add more mappings as needed
};

const reverseCategoryMap = Object.fromEntries(
  Object.entries(categoryMap).map(([id, name]) => [name, parseInt(id)])
);

// Get organizer dashboard data
router.get("/dashboard", verifyToken, (req, res) => {
  const organizerId = req.userId;
  
  // Check if user is organizer
  const roleQuery = "SELECT role, name FROM users WHERE id = ? AND role = 'organizer'";
  
  db.query(roleQuery, [organizerId], (err, roleResult) => {
    if (err) {
      console.error("Role check error:", err);
      return res.status(500).json({ message: "Database error checking user role" });
    }
    
    if (roleResult.length === 0) {
      return res.status(403).json({ message: "Access denied. Organizer role required." });
    }
    
    const userName = roleResult[0].name;
    
    // Get organizer's events (using your column names)
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
        e.status,
        COUNT(r.id) as registration_count 
      FROM events e 
      LEFT JOIN registrations r ON e.id = r.event_id 
      WHERE e.organizer_id = ? 
      GROUP BY e.id 
      ORDER BY e.updated_at DESC
    `;
    
    db.query(eventsQuery, [organizerId], (err, eventsResult) => {
      if (err) {
        console.error("Events query error:", err);
        return res.status(500).json({ message: "Database error fetching events" });
      }
      
      // Transform events to match frontend expectations
      const transformedEvents = eventsResult.map(event => ({
        ...event,
        category: categoryMap[event.sport_category_id] || 'Unknown',
        event_name: event.event_name,
        event_date: event.event_date,
        max_participants: event.max_participants
      }));
      
      // Get total registrations across all organizer's events
      const totalRegistrationsQuery = `
        SELECT COUNT(r.id) as totalRegistrations 
        FROM registrations r 
        JOIN events e ON r.event_id = e.id 
        WHERE e.organizer_id = ?
      `;
      
      db.query(totalRegistrationsQuery, [organizerId], (err, totalResult) => {
        if (err) {
          console.error("Total registrations query error:", err);
          return res.status(500).json({ message: "Database error fetching total registrations" });
        }
        
        res.json({
          name: userName,
          events: transformedEvents,
          totalRegistrations: totalResult[0]?.totalRegistrations || 0,
          totalEvents: transformedEvents.length
        });
      });
    });
  });
});

// Create new event
router.post("/create-event", verifyToken, (req, res) => {
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
    return res.status(400).json({ message: "Invalid category" });
  }
  
  // Check if user is organizer
  const roleQuery = "SELECT role FROM users WHERE id = ? AND role = 'organizer'";
  
  db.query(roleQuery, [organizerId], (err, roleResult) => {
    if (err) {
      console.error("Role check error:", err);
      return res.status(500).json({ message: "Database error checking user role" });
    }
    
    if (roleResult.length === 0) {
      return res.status(403).json({ message: "Access denied. Organizer role required." });
    }
    
    // Insert using your column names
    const insertQuery = `
      INSERT INTO events 
      (organizer_id, title, sport_category_id, date, location, description, capacity, image_url, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
        return res.status(500).json({ message: "Database error creating event" });
      }
      
      res.json({
        success: true,
        message: "Event created successfully",
        eventId: result.insertId
      });
    });
  });
});

// Delete event
router.delete("/delete-event/:eventId", verifyToken, (req, res) => {
  const organizerId = req.userId;
  const { eventId } = req.params;
  
  // Check if the event belongs to this organizer
  const checkOwnershipQuery = "SELECT id FROM events WHERE id = ? AND organizer_id = ?";
  
  db.query(checkOwnershipQuery, [eventId, organizerId], (err, result) => {
    if (err) {
      console.error("Ownership check error:", err);
      return res.status(500).json({ message: "Database error checking event ownership" });
    }
    
    if (result.length === 0) {
      return res.status(403).json({ message: "Access denied. You can only delete your own events." });
    }
    
    // First delete all registrations for this event
    const deleteRegistrationsQuery = "DELETE FROM registrations WHERE event_id = ?";
    
    db.query(deleteRegistrationsQuery, [eventId], (err) => {
      if (err) {
        console.error("Delete registrations error:", err);
        return res.status(500).json({ message: "Database error deleting registrations" });
      }
      
      // Then delete the event
      const deleteEventQuery = "DELETE FROM events WHERE id = ?";
      
      db.query(deleteEventQuery, [eventId], (err) => {
        if (err) {
          console.error("Delete event error:", err);
          return res.status(500).json({ message: "Database error deleting event" });
        }
        
        res.json({
          success: true,
          message: "Event deleted successfully"
        });
      });
    });
  });
});

export default router;