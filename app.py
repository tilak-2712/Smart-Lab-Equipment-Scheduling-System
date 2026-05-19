"""
Smart Lab Equipment Scheduling System — Backend
Author: Mini Project Demo
Flask API with JSON persistence, heap-based priority waitlist,
and interval conflict detection.
"""

from flask import Flask, request, jsonify, render_template
import json
import os
import heapq
from datetime import datetime

app = Flask(__name__)

# ─── File path (cross-platform using os.path) ────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH  = os.path.join(BASE_DIR, "database.json")

# ─── Default database structure ───────────────────────────────────────────────
DEFAULT_DB = {
    "equipment": {
        "E001": {
            "id": "E001",
            "name": "Oscilloscope",
            "status": "AVAILABLE",
            "current_booking": None,
            "bookings": [],
            "waitlist": []
        },
        "E002": {
            "id": "E002",
            "name": "3D Printer",
            "status": "AVAILABLE",
            "current_booking": None,
            "bookings": [],
            "waitlist": []
        },
        "E003": {
            "id": "E003",
            "name": "Soldering Station",
            "status": "AVAILABLE",
            "current_booking": None,
            "bookings": [],
            "waitlist": []
        },
        "E004": {
            "id": "E004",
            "name": "Arduino Kit",
            "status": "AVAILABLE",
            "current_booking": None,
            "bookings": [],
            "waitlist": []
        },
        "E005": {
            "id": "E005",
            "name": "Raspberry Pi",
            "status": "AVAILABLE",
            "current_booking": None,
            "bookings": [],
            "waitlist": []
        }
    },
    "booking_counter": 1
}

# ─── Initialise DB if not present ────────────────────────────────────────────
def init_db():
    if not os.path.exists(DB_PATH):
        with open(DB_PATH, "w") as f:
            json.dump(DEFAULT_DB, f, indent=2)

def read_db():
    with open(DB_PATH, "r") as f:
        return json.load(f)

def write_db(data):
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2)

# ─── CORS headers on every response ──────────────────────────────────────────
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

# ─── Priority score mapping ───────────────────────────────────────────────────
# 4th year → 4 (highest), 3rd → 3, 2nd → 2, 1st → 1
PRIORITY_MAP = {
    "4th Year": 4,
    "3rd Year": 3,
    "2nd Year": 2,
    "1st Year": 1
}

# ─── Conflict detection ───────────────────────────────────────────────────────
# C++ equivalent: interval-based sorting algorithm
def has_conflict(existing_bookings, new_start, new_end):
    """
    Check if [new_start, new_end) overlaps with any existing booking.
    Overlap condition: new_start < existing_end AND new_end > existing_start
    """
    for booking in existing_bookings:
        if new_start < booking["end_time"] and new_end > booking["start_time"]:
            return True
    return False

# ─── Waitlist promotion helper ────────────────────────────────────────────────
def promote_from_waitlist(equipment):
    """
    Pop the highest-priority entry from the waitlist (max-heap via negation)
    and create a booking for it, provided there's no conflict.
    """
    # C++ equivalent: priority_queue (Max-Heap)
    # Stored as min-heap with negated priority; restore to list after operations
    heap = []
    for entry in equipment["waitlist"]:
        # (-priority, timestamp, entry) keeps max-priority on top
        heapq.heappush(heap, (-entry["priority"], entry["timestamp"], entry))

    promoted = False
    remaining = []
    tried = set()

    while heap:
        neg_pri, ts, entry = heapq.heappop(heap)
        # Skip duplicates (shouldn't happen, but defensive)
        key = entry["usn"] + entry["start_time"]
        if key in tried:
            remaining.append(entry)
            continue
        tried.add(key)

        # Check if time slot is still free
        if not has_conflict(equipment["bookings"], entry["start_time"], entry["end_time"]):
            # Promote this student
            new_booking = {
                "booking_id": entry.get("booking_id", "W-" + str(int(ts))),
                "usn": entry["usn"],
                "equipment_id": equipment["id"],
                "start_time": entry["start_time"],
                "end_time": entry["end_time"],
                "priority_year": entry["priority_year"],
                "booked_at": datetime.now().isoformat()
            }
            equipment["bookings"].append(new_booking)
            equipment["status"] = "BOOKED"
            equipment["current_booking"] = new_booking
            promoted = True
            break
        else:
            remaining.append(entry)

    # Rebuild waitlist from remaining entries
    rest = []
    while heap:
        _, _, entry = heapq.heappop(heap)
        rest.append(entry)
    equipment["waitlist"] = remaining + rest
    return promoted

# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Serve SPA ────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

# ─── GET /api/equipment ───────────────────────────────────────────────────────
@app.route("/api/equipment", methods=["GET"])
def get_equipment():
    """
    Returns the full equipment registry.
    C++ equivalent: unordered_map iteration
    """
    db = read_db()
    # C++ equivalent: unordered_map<string, Equipment>
    equipment_registry = db["equipment"]
    equipment_list = list(equipment_registry.values())
    return jsonify({"success": True, "equipment": equipment_list}), 200

# ─── POST /api/book ───────────────────────────────────────────────────────────
@app.route("/api/book", methods=["POST", "OPTIONS"])
def book_equipment():
    """
    Creates a booking if no conflict exists.
    Body: { usn, equipment_id, start_time, end_time, priority_year }
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    db = read_db()
    data = request.get_json()

    usn          = data.get("usn", "").strip()
    equipment_id = data.get("equipment_id", "").strip()
    start_time   = data.get("start_time", "").strip()
    end_time     = data.get("end_time", "").strip()
    priority_year= data.get("priority_year", "1st Year")

    # ── Validation ────────────────────────────────────────────────────────────
    if not all([usn, equipment_id, start_time, end_time]):
        return jsonify({"success": False, "reason": "Missing required fields"}), 400

    # C++ equivalent: unordered_map lookup
    equipment_registry = db["equipment"]
    if equipment_id not in equipment_registry:
        return jsonify({"success": False, "reason": "Equipment not found"}), 404

    equipment = equipment_registry[equipment_id]

    # ── Conflict detection ────────────────────────────────────────────────────
    # C++ equivalent: interval-based sorting algorithm
    # C++ equivalent: std::vector of bookings
    if has_conflict(equipment["bookings"], start_time, end_time):
        return jsonify({"success": False, "reason": "CONFLICT"}), 200

    # ── Create booking ────────────────────────────────────────────────────────
    booking_id = "B{:04d}".format(db["booking_counter"])
    db["booking_counter"] += 1

    new_booking = {
        "booking_id": booking_id,
        "usn": usn,
        "equipment_id": equipment_id,
        "start_time": start_time,
        "end_time": end_time,
        "priority_year": priority_year,
        "booked_at": datetime.now().isoformat()
    }

    # C++ equivalent: std::vector push_back
    equipment["bookings"].append(new_booking)
    equipment["status"] = "BOOKED"
    equipment["current_booking"] = new_booking

    db["equipment"][equipment_id] = equipment
    write_db(db)

    return jsonify({"success": True, "booking_id": booking_id}), 200

# ─── POST /api/waitlist ───────────────────────────────────────────────────────
@app.route("/api/waitlist", methods=["POST", "OPTIONS"])
def add_to_waitlist():
    """
    Adds a student to the priority waitlist.
    C++ equivalent: priority_queue (Max-Heap) via heapq
    Body: { usn, equipment_id, start_time, end_time, priority_year }
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    db = read_db()
    data = request.get_json()

    usn          = data.get("usn", "").strip()
    equipment_id = data.get("equipment_id", "").strip()
    start_time   = data.get("start_time", "").strip()
    end_time     = data.get("end_time", "").strip()
    priority_year= data.get("priority_year", "1st Year")

    if not all([usn, equipment_id, start_time, end_time]):
        return jsonify({"success": False, "reason": "Missing required fields"}), 400

    equipment_registry = db["equipment"]
    if equipment_id not in equipment_registry:
        return jsonify({"success": False, "reason": "Equipment not found"}), 404

    equipment = equipment_registry[equipment_id]
    priority  = PRIORITY_MAP.get(priority_year, 1)

    waitlist_entry = {
        "usn": usn,
        "equipment_id": equipment_id,
        "start_time": start_time,
        "end_time": end_time,
        "priority_year": priority_year,
        "priority": priority,
        "timestamp": datetime.now().timestamp(),  # tiebreaker
        "booking_id": "W{:04d}".format(int(datetime.now().timestamp()))
    }

    # C++ equivalent: priority_queue (Max-Heap) push
    equipment["waitlist"].append(waitlist_entry)
    # Sort by priority desc, then timestamp asc (FIFO within same priority)
    equipment["waitlist"].sort(key=lambda x: (-x["priority"], x["timestamp"]))

    db["equipment"][equipment_id] = equipment
    write_db(db)

    return jsonify({"success": True, "message": "Added to waitlist"}), 200

# ─── POST /api/cancel ────────────────────────────────────────────────────────
@app.route("/api/cancel", methods=["POST", "OPTIONS"])
def cancel_booking():
    """
    Cancels a booking and auto-promotes from waitlist if applicable.
    Body: { booking_id, equipment_id }
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    db = read_db()
    data = request.get_json()

    booking_id   = data.get("booking_id", "").strip()
    equipment_id = data.get("equipment_id", "").strip()

    if not all([booking_id, equipment_id]):
        return jsonify({"success": False, "reason": "Missing required fields"}), 400

    equipment_registry = db["equipment"]
    if equipment_id not in equipment_registry:
        return jsonify({"success": False, "reason": "Equipment not found"}), 404

    equipment = equipment_registry[equipment_id]

    # ── Remove booking from list ──────────────────────────────────────────────
    # C++ equivalent: std::vector erase with find
    original_len = len(equipment["bookings"])
    equipment["bookings"] = [
        b for b in equipment["bookings"] if b["booking_id"] != booking_id
    ]

    if len(equipment["bookings"]) == original_len:
        return jsonify({"success": False, "reason": "Booking not found"}), 404

    # ── Auto-promote from waitlist FIRST ─────────────────────────────────────
    # C++ equivalent: priority_queue (Max-Heap) pop
    if equipment["waitlist"]:
        promote_from_waitlist(equipment)

    # ── Recompute status and current_booking from scratch ────────────────────
    # Check for any booking whose end_time is in the future
    now_str = datetime.now().isoformat()
    future_bookings = [b for b in equipment["bookings"] if b["end_time"] > now_str]

    if future_bookings:
        # Sort by start_time so the soonest upcoming is treated as "current"
        future_bookings.sort(key=lambda b: b["start_time"])
        equipment["status"] = "BOOKED"
        equipment["current_booking"] = future_bookings[0]
    else:
        # No upcoming bookings at all — equipment is free
        equipment["status"] = "AVAILABLE"
        equipment["current_booking"] = None

    db["equipment"][equipment_id] = equipment
    write_db(db)

    return jsonify({"success": True, "message": "Booking cancelled"}), 200

# ─── GET /api/waitlist/<equipment_id> ────────────────────────────────────────
@app.route("/api/waitlist/<equipment_id>", methods=["GET"])
def get_waitlist(equipment_id):
    """Returns the priority waitlist for a given equipment."""
    db = read_db()
    equipment_registry = db["equipment"]

    if equipment_id not in equipment_registry:
        return jsonify({"success": False, "reason": "Equipment not found"}), 404

    # C++ equivalent: priority_queue (Max-Heap) view
    waitlist = equipment_registry[equipment_id]["waitlist"]
    return jsonify({"success": True, "waitlist": waitlist}), 200

# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5001, debug=False)
