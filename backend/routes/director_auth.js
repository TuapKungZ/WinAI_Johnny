import express from "express";
import pool from "../db/pool.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/login", async (req, res) => {
    const { director_code, password } = req.body;

    try {
        const result = await pool.query(
            `SELECT * FROM directors WHERE director_code = $1`,
            [director_code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: "รหัสผู้อำนวยการไม่ถูกต้อง" });
        }

        const director = result.rows[0];
        const valid = await bcrypt.compare(password, director.password_hash);
        if (!valid) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });

        const token = jwt.sign(
            { id: director.id, director_code: director.director_code },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        res.json({
            success: true,
            token,
            director: {
                id: director.id,
                director_code: director.director_code,
                first_name: director.first_name,
                last_name: director.last_name,
                photo_url: director.photo_url
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/register", async (req, res) => {
    try {
        const { director_code, first_name, last_name, password } = req.body;

        if (!director_code || !password) {
            return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
        }

        const check = await pool.query(
            "SELECT id FROM directors WHERE director_code = $1",
            [director_code]
        );
        if (check.rows.length > 0) {
            return res.status(400).json({ error: "รหัสผู้อำนวยการนี้มีอยู่แล้ว" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO directors (director_code, first_name, last_name, password_hash)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [director_code, first_name, last_name, hashed]
        );

        res.json({ success: true, director_id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
