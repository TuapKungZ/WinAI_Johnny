import express from "express";
import pool from "../db/pool.js";

const router = express.Router();

// ค้นหารายวิชา
router.get("/search", async (req, res) => {
    const { keyword } = req.query;

    const result = await pool.query(
        `SELECT * FROM subjects 
         WHERE subject_code ILIKE $1 OR name ILIKE $1`,
        [`%${keyword}%`]
    );

    res.json(result.rows);
});

// แสดงรายวิชาที่เปิดสอนในปี/เทอมนี้
router.get("/sections", async (req, res) => {
    const { year, semester } = req.query;

    const result = await pool.query(
        `SELECT ss.*,
                s.subject_code,
                s.name AS subject_name,
                s.credit,
                (t.first_name || ' ' || t.last_name) AS teacher_name
         FROM subject_sections ss
         JOIN subjects s ON ss.subject_id = s.id
         LEFT JOIN teachers t ON ss.teacher_id = t.id
         WHERE ss.year = $1 AND ss.semester = $2`,
        [year, semester]
    );

    res.json(result.rows);
});

// ดูรายวิชาทั้งหมดที่เปิดสอนในเทอมนี้ (กรองตาม class_level + room ของนักเรียน)
router.get("/browse", async (req, res) => {
    const { year, semester, class_level, room } = req.query;

    try {
        const result = await pool.query(
            `SELECT ss.id AS section_id, ss.subject_id,
                    s.subject_code, s.name AS subject_name, s.credit,
                    ss.day_of_week, ss.time_range,
                    ss.class_level, ss.classroom, ss.room,
                    (t.first_name || ' ' || t.last_name) AS teacher_name
             FROM subject_sections ss
             JOIN subjects s ON ss.subject_id = s.id
             LEFT JOIN teachers t ON ss.teacher_id = t.id
             WHERE ss.year = $1 AND ss.semester = $2
               AND ss.class_level = $3 AND (ss.classroom = $4 OR ss.room = $4)
             ORDER BY s.subject_code, ss.day_of_week`,
            [year, semester, class_level, room]
        );

        // Group by subject
        const grouped = {};
        result.rows.forEach(row => {
            if (!grouped[row.subject_code]) {
                grouped[row.subject_code] = {
                    subject_id: row.subject_id,
                    section_id: row.section_id,
                    subject_code: row.subject_code,
                    subject_name: row.subject_name,
                    credit: row.credit,
                    teacher_name: row.teacher_name,
                    schedules: []
                };
            }
            grouped[row.subject_code].schedules.push({
                section_id: row.section_id,
                day_of_week: row.day_of_week,
                time_range: row.time_range
            });
        });

        res.json(Object.values(grouped));
    } catch (err) {
        console.error("ERROR /registration/browse:", err);
        res.status(500).json({ error: "Server error" });
    }
});

//แก้ที่ registration.js
// เพิ่มวิชาเข้าตะกร้า (แก้ไขให้เพิ่มทุกคาบเรียนของวิชานั้น)
router.post("/add", async (req, res) => {
    const { student_id, section_id, year, semester } = req.body;

    try {
        // 1. ค้นหาข้อมูลของ section ที่ส่งมาก่อน เพื่อดูว่าเป็นวิชาอะไร ห้องไหน (subject_id, class_level, classroom)
        const checkQuery = `SELECT subject_id, class_level, classroom 
                            FROM subject_sections 
                            WHERE id = $1`;
        const checkResult = await pool.query(checkQuery, [section_id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: "ไม่พบรายวิชา" });
        }

        const { subject_id, class_level, classroom } = checkResult.rows[0];

        // 2. Insert ข้อมูลลง registrations โดยดึง "ทุก Section" ที่ตรงเงื่อนไข (วิชาเดียวกัน ห้องเดียวกัน)
        // ใช้ INSERT INTO ... SELECT ... เพื่อดึงข้อมูลและบันทึกในคำสั่งเดียว
        const insertQuery = `
            INSERT INTO registrations(student_id, section_id, year, semester, status)
            SELECT $1, id, $3, $4, 'cart'
            FROM subject_sections
            WHERE subject_id = $2 
              AND year = $3 
              AND semester = $4
              AND class_level = $5 
              AND classroom = $6
              -- ป้องกันการเพิ่มซ้ำ: เช็คว่า student_id นี้ยังไม่มี section_id นี้ในตะกร้า
              AND id NOT IN (
                  SELECT section_id FROM registrations 
                  WHERE student_id = $1 AND year = $3 AND semester = $4
              )
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            student_id,
            subject_id,
            year,
            semester,
            class_level,
            classroom
        ]);

        res.json({
            success: true,
            added_rows: result.rowCount,
            data: result.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error during registration" });
    }
});

// แสดงตะกร้าลงทะเบียน
router.get("/cart", async (req, res) => {
    const { student_id, year, semester } = req.query;

    const result = await pool.query(
        `SELECT r.*, s.subject_code, s.name AS subject_name, s.credit,
                ss.time_range, ss.day_of_week,
                (t.first_name || ' ' || t.last_name) AS teacher_name
         FROM registrations r
         JOIN subject_sections ss ON r.section_id = ss.id
         JOIN subjects s ON ss.subject_id = s.id
         LEFT JOIN teachers t ON ss.teacher_id = t.id
         WHERE r.student_id = $1 AND r.year = $2 AND r.semester = $3
           AND r.status = 'cart'`,
        [student_id, year, semester]
    );

    res.json(result.rows);
});

// แสดงรายวิชาที่บันทึกแล้ว
router.get("/registered", async (req, res) => {
    const { student_id, year, semester } = req.query;

    const result = await pool.query(
        `SELECT r.*, s.subject_code, s.name AS subject_name, s.credit,
                ss.subject_id,
                ss.time_range, ss.day_of_week,
                (t.first_name || ' ' || t.last_name) AS teacher_name
         FROM registrations r
         JOIN subject_sections ss ON r.section_id = ss.id
         JOIN subjects s ON ss.subject_id = s.id
         LEFT JOIN teachers t ON ss.teacher_id = t.id
         WHERE r.student_id = $1 AND r.year = $2 AND r.semester = $3
           AND r.status = 'registered'`,
        [student_id, year, semester]
    );

    res.json(result.rows);
});

// ยืนยันบันทึกรายวิชาในตะกร้า
router.post("/confirm", async (req, res) => {
    const { student_id, year, semester } = req.body;

    const result = await pool.query(
        `UPDATE registrations
         SET status = 'registered'
         WHERE student_id = $1 AND year = $2 AND semester = $3
           AND status = 'cart'
         RETURNING *`,
        [student_id, year, semester]
    );

    res.json({ success: true, updated: result.rowCount });
});

// ลบจากตะกร้า
router.delete("/remove/:id", async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
        `DELETE FROM registrations WHERE id = $1 RETURNING *`,
        [id]
    );

    res.json(result.rows[0]);
});

export default router;