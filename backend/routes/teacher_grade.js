import express from "express";
import pool from "../db/pool.js";

const router = express.Router();

const DEFAULT_THRESHOLDS = {
    a: 80,
    b_plus: 75,
    b: 70,
    c_plus: 65,
    c: 60,
    d_plus: 55,
    d: 50,
    f: 30
};

/* ---------------------------------------------------
   0) โหลดเกณฑ์คะแนนตัดเกรด
--------------------------------------------------- */
router.get("/thresholds", async (req, res) => {
    try {
        const { section_id } = req.query;
        if (!section_id) {
            return res.status(400).json({ error: "section_id required" });
        }

        const result = await pool.query(
            `SELECT a, b_plus, b, c_plus, c, d_plus, d, f
             FROM grade_thresholds
             WHERE section_id = $1`,
            [section_id]
        );

        if (result.rows.length === 0) {
            return res.json(DEFAULT_THRESHOLDS);
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error("ERROR /thresholds:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ---------------------------------------------------
   0.1) บันทึกเกณฑ์คะแนนตัดเกรด
--------------------------------------------------- */
router.put("/thresholds", async (req, res) => {
    try {
        const { section_id, thresholds } = req.body;
        if (!section_id || !thresholds) {
            return res.status(400).json({ error: "section_id and thresholds required" });
        }

        const values = {
            a: Number(thresholds.a),
            b_plus: Number(thresholds.b_plus),
            b: Number(thresholds.b),
            c_plus: Number(thresholds.c_plus),
            c: Number(thresholds.c),
            d_plus: Number(thresholds.d_plus),
            d: Number(thresholds.d),
            f: Number(thresholds.f)
        };

        await pool.query(
            `INSERT INTO grade_thresholds
                (section_id, a, b_plus, b, c_plus, c, d_plus, d, f)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (section_id)
             DO UPDATE SET
                a = EXCLUDED.a,
                b_plus = EXCLUDED.b_plus,
                b = EXCLUDED.b,
                c_plus = EXCLUDED.c_plus,
                c = EXCLUDED.c,
                d_plus = EXCLUDED.d_plus,
                d = EXCLUDED.d,
                f = EXCLUDED.f`,
            [
                section_id,
                values.a,
                values.b_plus,
                values.b,
                values.c_plus,
                values.c,
                values.d_plus,
                values.d,
                values.f
            ]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /thresholds:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ---------------------------------------------------
   1) ดึงหัวข้อคะแนนทั้งหมดของ section
--------------------------------------------------- */
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

/* ---------------------------------------------------
   2) ดึงคะแนนรายนักเรียนทุกหัวข้อ
--------------------------------------------------- */
router.get("/scores", async (req, res) => {
    try {
        const { section_id } = req.query;

        const students = await pool.query(
            `SELECT st.id AS student_id,
                    st.student_code,
                    st.first_name,
                    st.last_name,
                    g.total_score AS saved_total_score,
                    g.grade AS saved_grade
             FROM registrations r
             JOIN students st ON r.student_id = st.id
             LEFT JOIN grades g
                ON g.student_id = st.id AND g.section_id = $1
             WHERE r.section_id = $1
             ORDER BY st.student_code ASC`,
            [section_id]
        );

        const headers = await pool.query(
            `SELECT id, title, max_score 
             FROM score_items 
             WHERE section_id = $1
             ORDER BY id ASC`,
            [section_id]
        );

        const scoreRows = await pool.query(
            `SELECT sc.item_id, sc.student_id, sc.score
             FROM scores sc
             JOIN score_items si ON sc.item_id = si.id
             WHERE si.section_id = $1`,
            [section_id]
        );

        const scores = scoreRows.rows;

        const resp = students.rows.map((stu) => {
            let total = 0;
            let detail = [];

            headers.rows.forEach((h) => {
                const sc = scores.find(
                    (x) => x.item_id === h.id && x.student_id === stu.student_id
                );

                const point = sc ? Number(sc.score) : 0;
                total += point;

                detail.push({
                    header_id: h.id,
                    title: h.title,
                    max_score: h.max_score,
                    score: point,
                });
            });

            return {
                student_id: stu.student_id,
                student_code: stu.student_code,
                name: stu.first_name + " " + stu.last_name,
                total_score: total,
                saved_total_score: stu.saved_total_score,
                saved_grade: stu.saved_grade,
                details: detail,
            };
        });

        res.json(resp);
    } catch (err) {
        console.error("ERROR /scores:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* ---------------------------------------------------
   3) บันทึกเกรด
--------------------------------------------------- */
router.post("/save", async (req, res) => {
    try {
        const { section_id, grades } = req.body;

        // grades = [{ student_id, total_score, grade }]

        for (const g of grades) {
            const updated = await pool.query(
                `UPDATE grades
                 SET total_score = $1, grade = $2
                 WHERE student_id = $3 AND section_id = $4`,
                [g.total_score, g.grade, g.student_id, section_id]
            );

            if (updated.rowCount === 0) {
                await pool.query(
                    `INSERT INTO grades (student_id, section_id, total_score, grade)
                     VALUES ($1, $2, $3, $4)`,
                    [g.student_id, section_id, g.total_score, g.grade]
                );
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /save:", err);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
