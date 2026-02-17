import express from "express";
import pool from "../db/pool.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

/* ----------------------------------------------------
   LOGIN TEACHER
---------------------------------------------------- */
router.post("/login", async (req, res) => {
    const { teacher_code, password } = req.body;

    try {
        // เปลี่ยนจาก username → teacher_code
        const result = await pool.query(
            `SELECT * FROM teachers WHERE teacher_code = $1`,
            [teacher_code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: "รหัสครูไม่ถูกต้อง" });
        }

        const teacher = result.rows[0];

        const valid = await bcrypt.compare(password, teacher.password_hash);
        if (!valid) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });

        // JWT
        const token = jwt.sign(
            { id: teacher.id, teacher_code: teacher.teacher_code },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        res.json({
            success: true,
            token,
            teacher: {
                id: teacher.id,
                teacher_code: teacher.teacher_code,
                first_name: teacher.first_name,
                last_name: teacher.last_name,
                photo_url: teacher.photo_url
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// สมัครครูใหม่ (Register)
router.post("/register", async (req, res) => {
    try {
        const { teacher_code, first_name, last_name, password } = req.body;

        if (!teacher_code || !password)
            return res.status(400).json({ error: "ข้อมูลไม่ครบ" });

        // Check ว่ามี teacher_code ซ้ำไหม
        const check = await pool.query(
            "SELECT id FROM teachers WHERE teacher_code = $1",
            [teacher_code]
        );

        if (check.rows.length > 0)
            return res.status(400).json({ error: "รหัสครูนี้มีอยู่แล้ว" });

        const hashed = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO teachers (teacher_code, first_name, last_name, password_hash)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [teacher_code, first_name, last_name, hashed]
        );

        res.json({ success: true, teacher_id: result.rows[0].id });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});
export default router;
