import express from "express";
import pool from "../db/pool.js";

const router = express.Router();

// ดึงผลการเรียนทั้งหมดของนักเรียน
router.get("/", async (req, res) => {
    const { student_id, year, semester } = req.query;

    try {
        const result = await pool.query(
            `SELECT DISTINCT ON (s.subject_code)
                    s.name AS subject,
                    s.subject_code,
                    s.credit,
                    g.total_score AS total,
                    g.grade
             FROM registrations r
             JOIN subject_sections ss ON r.section_id = ss.id
             JOIN subjects s ON ss.subject_id = s.id
             LEFT JOIN grades g ON g.student_id = r.student_id AND g.section_id = r.section_id
             WHERE r.student_id = $1
               AND ($2::int IS NULL OR ss.year = $2)
               AND ($3::int IS NULL OR ss.semester = $3)
             ORDER BY s.subject_code ASC, g.grade DESC NULLS LAST`,
            [student_id, year || null, semester || null]
        );

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});


export default router;
