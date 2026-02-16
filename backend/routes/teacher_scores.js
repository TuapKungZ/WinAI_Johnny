import express from "express";
import pool from "../db/pool.js";

const router = express.Router();

/* ----------------------------------------------------
   1) ดึงรายวิชาที่ครูสอน (ตาม teacher_id)
---------------------------------------------------- */
router.get("/subjects", async (req, res) => {
    try {
        const { teacher_id } = req.query;

        const result = await pool.query(
            `SELECT ss.id AS section_id,
                    ss.subject_id,
                    s.subject_code,
                    s.name AS subject_name,
                    ss.class_level,
                    ss.classroom AS room,
                    ss.year,
                    ss.semester
             FROM subject_sections ss
             JOIN subjects s ON ss.subject_id = s.id
             WHERE ss.teacher_id = $1`,
            [teacher_id]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /subjects:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ----------------------------------------------------
   2) ดึงหัวข้อคะแนน (Score Headers)
---------------------------------------------------- */
router.get("/headers", async (req, res) => {
    try {
        const { section_id } = req.query;

        const result = await pool.query(
            `SELECT id, title, max_score
             FROM score_items
             WHERE section_id = $1
             ORDER BY id ASC`,
            [section_id]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /headers:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ----------------------------------------------------
   3) เพิ่มหัวข้อคะแนนใหม่
---------------------------------------------------- */
router.post("/header_add", async (req, res) => {
    try {
        const { section_id, header_name, max_score } = req.body;

        const result = await pool.query(
            `INSERT INTO score_items (section_id, title, max_score)
             VALUES ($1, $2, $3)
             RETURNING id, title, max_score`,
            [section_id, header_name, max_score]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error("ERROR /header_add:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ----------------------------------------------------
   4) ลบหัวข้อคะแนน
---------------------------------------------------- */
router.delete("/header_delete/:id", async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(
            `DELETE FROM scores WHERE item_id = $1`,
            [id]
        );

        await pool.query(
            `DELETE FROM score_items WHERE id = $1`,
            [id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /header_delete:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ----------------------------------------------------
   4.5) แก้ไขหัวข้อคะแนน (ชื่อ + คะแนนเต็ม)
---------------------------------------------------- */
router.put("/header_update/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { title, max_score } = req.body;

        const result = await pool.query(
            `UPDATE score_items SET title = $1, max_score = $2 WHERE id = $3 RETURNING id, title, max_score`,
            [title, max_score, id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: "Header not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error("ERROR /header_update:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ----------------------------------------------------
   4) ดึงรายชื่อนักเรียนใน section นั้น
---------------------------------------------------- */
router.get("/students", async (req, res) => {
    try {
        const { section_id } = req.query;

        const result = await pool.query(
            `SELECT st.id AS student_id,
                    st.student_code,
                    st.first_name,
                    st.last_name
             FROM registrations r
             JOIN students st ON r.student_id = st.id
             WHERE r.section_id = $1
             ORDER BY st.student_code ASC`,
            [section_id]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /students:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ----------------------------------------------------
   5) ดึงคะแนนตาม header_id
---------------------------------------------------- */
router.get("/scores", async (req, res) => {
    try {
        const { header_id } = req.query;

        if (!header_id) {
            return res.status(400).json({ error: "header_id required" });
        }

        const result = await pool.query(
            `SELECT student_id, score
             FROM scores
             WHERE item_id = $1`,
            [header_id]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /scores:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ----------------------------------------------------
   5) บันทึกคะแนนของหัวข้อคะแนน
---------------------------------------------------- */
router.post("/save", async (req, res) => {
    try {
        const { header_id, scores } = req.body;

        // scores = [{ student_id, score }, ...]

        for (let sc of scores) {
            await pool.query(
                `DELETE FROM scores WHERE item_id = $1 AND student_id = $2`,
                [header_id, sc.student_id]
            );
            await pool.query(
                `INSERT INTO scores (item_id, student_id, score)
                 VALUES ($1, $2, $3)`,
                [header_id, sc.student_id, sc.score]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /save:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

export default router;
