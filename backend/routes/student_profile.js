import express from "express";
import pool from "../db/pool.js";

const router = express.Router();

router.get("/profile", async (req, res) => {
    try {
        const { student_id } = req.query;
        if (!student_id) return res.status(400).json({ error: "?????????????????????" });

        const result = await pool.query(
            `SELECT id, student_code, first_name, last_name, class_level, classroom, room, birthday, phone, address
             FROM students WHERE id=$1`,
            [student_id]
        );

        if (!result.rows.length) return res.status(404).json({ error: "?????????????" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error("ERROR /student/profile:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/profile/update", async (req, res) => {
    try {
        const { student_id, first_name, last_name, birthday, phone, address } = req.body;
        if (!student_id) return res.status(400).json({ error: "?????????????????????" });

        await pool.query(
            `UPDATE students
             SET first_name=$1, last_name=$2, birthday=$3, phone=$4, address=$5
             WHERE id=$6`,
            [first_name || null, last_name || null, birthday || null, phone || null, address || null, student_id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /student/profile/update:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/advisor", async (req, res) => {
    try {
        const { student_id, year, semester } = req.query;
        if (!student_id) return res.status(400).json({ error: "student_id required" });

        const studentRes = await pool.query(
            `SELECT class_level, room FROM students WHERE id=$1`,
            [student_id]
        );
        if (!studentRes.rows.length) return res.status(404).json({ error: "student not found" });

        const { class_level: classLevel, room: studentRoom } = studentRes.rows[0];
        const params = [classLevel, studentRoom || ""];
        let filter = "";
        if (year && semester) {
            params.push(year, semester);
            filter = " AND ta.year = $3 AND ta.semester = $4";
        }

        const advisorRes = await pool.query(
            `SELECT ta.id, ta.year, ta.semester,
                    t.teacher_code, t.first_name, t.last_name
             FROM teacher_advisors ta
             JOIN teachers t ON ta.teacher_id = t.id
             WHERE ta.class_level = $1 AND ta.room = $2${filter}
             ORDER BY t.teacher_code ASC`,
            params
        );

        if (!advisorRes.rows.length) {
            return res.json({ advisors: [] });
        }

        res.json({ advisors: advisorRes.rows });
    } catch (err) {
        console.error("ERROR /student/advisor:", err);
        res.status(500).json({ error: "Server error" });
    }
});

async function ensureAdvisorEvaluationTable() {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS advisor_evaluation_results (
            id SERIAL PRIMARY KEY,
            student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            teacher_id integer NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
            topic character varying(255) NOT NULL,
            score integer,
            year integer NOT NULL,
            semester integer NOT NULL,
            created_at timestamp without time zone DEFAULT now()
        )`
    );
}

async function ensureSubjectEvaluationTable() {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS subject_evaluation_results (
            id SERIAL PRIMARY KEY,
            student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            teacher_id integer NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
            section_id integer NOT NULL REFERENCES subject_sections(id) ON DELETE CASCADE,
            topic character varying(255) NOT NULL,
            score integer,
            year integer NOT NULL,
            semester integer NOT NULL,
            created_at timestamp without time zone DEFAULT now()
        )`
    );
}

router.get("/advisor_evaluation", async (req, res) => {
    try {
        const { student_id, year, semester } = req.query;
        if (!student_id || !year || !semester) {
            return res.status(400).json({ error: "Missing required params" });
        }

        await ensureAdvisorEvaluationTable();

        const result = await pool.query(
            `SELECT topic AS name, ROUND(AVG(score)::numeric, 2) AS score
             FROM advisor_evaluation_results
             WHERE student_id=$1 AND year=$2 AND semester=$3
             GROUP BY topic
             ORDER BY topic ASC`,
            [student_id, year, semester]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /student/advisor_evaluation:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/subject_evaluation", async (req, res) => {
    try {
        await ensureSubjectEvaluationTable();
        const { student_id, section_id, year, semester, subject_id } = req.query;
        if (!student_id || !section_id || !year || !semester) {
            return res.status(400).json({ error: "Missing required params" });
        }
        const rows = await pool.query(
            `SELECT topic, score
             FROM subject_evaluation_results
             WHERE student_id=$1 AND section_id=$2 AND year=$3 AND semester=$4
             ORDER BY topic ASC`,
            [student_id, section_id, year, semester]
        );
        if (rows.rows.length) {
            return res.json(rows.rows);
        }

        if (subject_id) {
            const fallback = await pool.query(
                `SELECT DISTINCT ON (r.topic) r.topic, r.score
                 FROM subject_evaluation_results r
                 JOIN subject_sections ss ON r.section_id = ss.id
                 WHERE r.student_id=$1 AND ss.subject_id=$2
                 ORDER BY r.topic, r.created_at DESC`,
                [student_id, subject_id]
            );
            return res.json(fallback.rows);
        }

        const fallback = await pool.query(
            `SELECT topic, score
             FROM subject_evaluation_results
             WHERE student_id=$1 AND section_id=$2
             ORDER BY year DESC, semester DESC, topic ASC`,
            [student_id, section_id]
        );
        res.json(fallback.rows);
    } catch (err) {
        console.error("ERROR /student/subject_evaluation:", err);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
