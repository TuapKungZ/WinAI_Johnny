import express from "express";
import pool from "../db/pool.js";
import bcrypt from "bcryptjs";

const router = express.Router();

async function verifyDirectorPassword(director_code, password) {
    if (!director_code || !password) {
        return { ok: false, status: 400, message: "à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸à¸£à¸«à¸±à¸ªà¸œà¸¹à¹‰à¸­à¸³à¸™à¸§à¸¢à¸à¸²à¸£" };
    }

    const result = await pool.query(
        "SELECT password_hash FROM directors WHERE director_code = $1",
        [director_code]
    );
    if (result.rows.length === 0) {
        return { ok: false, status: 400, message: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸œà¸¹à¹‰à¸­à¸³à¸™à¸§à¸¢à¸à¸²à¸£" };
    }

    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) {
        return { ok: false, status: 401, message: "à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™à¹„à¸¡à¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡" };
    }

    return { ok: true };
}

async function ensureStudentProfileColumns() {
    await pool.query(`
        ALTER TABLE students
            ADD COLUMN IF NOT EXISTS prefix VARCHAR(20),
            ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
            ADD COLUMN IF NOT EXISTS status VARCHAR(50),
            ADD COLUMN IF NOT EXISTS parent_name VARCHAR(150),
            ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(30)
    `);
}

async function ensureTeacherProfileColumns() {
    await pool.query(`
        ALTER TABLE teachers
            ADD COLUMN IF NOT EXISTS prefix VARCHAR(20),
            ADD COLUMN IF NOT EXISTS national_id VARCHAR(30),
            ADD COLUMN IF NOT EXISTS birthday DATE,
            ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
            ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5),
            ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50),
            ADD COLUMN IF NOT EXISTS position VARCHAR(100),
            ADD COLUMN IF NOT EXISTS academic_rank VARCHAR(100),
            ADD COLUMN IF NOT EXISTS department VARCHAR(100),
            ADD COLUMN IF NOT EXISTS start_date DATE,
            ADD COLUMN IF NOT EXISTS end_date DATE,
            ADD COLUMN IF NOT EXISTS license_no VARCHAR(50),
            ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2),
            ADD COLUMN IF NOT EXISTS status VARCHAR(50),
            ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
            ADD COLUMN IF NOT EXISTS email VARCHAR(120),
            ADD COLUMN IF NOT EXISTS line_id VARCHAR(60)
    `);
}

async function ensureClassroomMaster() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS classroom_master (
            id SERIAL PRIMARY KEY,
            class_level VARCHAR(20) NOT NULL,
            room VARCHAR(10) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (class_level, room)
        )
    `);

    // Backfill from existing data so old records are available in dropdowns.
    await pool.query(`
        INSERT INTO classroom_master(class_level, room)
        SELECT class_level, room
        FROM (
            SELECT DISTINCT
                TRIM(class_level) AS class_level,
                TRIM(COALESCE(NULLIF(classroom, ''), NULLIF(room, ''))) AS room
            FROM students
            WHERE class_level IS NOT NULL
            UNION
            SELECT DISTINCT
                TRIM(class_level) AS class_level,
                TRIM(COALESCE(NULLIF(classroom, ''), NULLIF(room, ''))) AS room
            FROM subject_sections
            WHERE class_level IS NOT NULL
        ) src
        WHERE src.class_level <> '' AND src.room <> ''
        ON CONFLICT (class_level, room) DO NOTHING
    `);
}

// SUMMARY
router.get("/summary", async (req, res) => {
    try {
        const students = await pool.query("SELECT COUNT(*) FROM students");
        const teachers = await pool.query("SELECT COUNT(*) FROM teachers");
        const subjects = await pool.query("SELECT COUNT(*) FROM subjects");
        const activities = await pool.query("SELECT COUNT(*) FROM school_activities");
        const income = await pool.query(
            "SELECT COALESCE(SUM(amount),0) AS total FROM finance_records WHERE type='income'"
        );
        const expense = await pool.query(
            "SELECT COALESCE(SUM(amount),0) AS total FROM finance_records WHERE type='expense'"
        );
        const gender = await pool.query(
            `SELECT
                SUM(CASE WHEN gender ILIKE 'à¸Šà¸²à¸¢%' OR gender ILIKE 'male%' OR gender ILIKE 'm' THEN 1 ELSE 0 END) AS male,
                SUM(CASE WHEN gender ILIKE 'à¸«à¸à¸´à¸‡%' OR gender ILIKE 'female%' OR gender ILIKE 'f' THEN 1 ELSE 0 END) AS female
             FROM students`
        );

        res.json({
            students: Number(students.rows[0].count),
            teachers: Number(teachers.rows[0].count),
            subjects: Number(subjects.rows[0].count),
            activities: Number(activities.rows[0].count),
            income: Number(income.rows[0].total),
            expense: Number(expense.rows[0].total),
            male: Number(gender.rows[0].male || 0),
            female: Number(gender.rows[0].female || 0)
        });
    } catch (err) {
        console.error("ERROR /director/summary:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// STUDENTS CRUD
router.get("/students", async (req, res) => {
    try {
        await ensureStudentProfileColumns();
        const { search, class_level, room } = req.query;

        const params = [];
        const where = [];

        if (search) {
            params.push(`%${search}%`);
            where.push(
                `(student_code ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`
            );
        }

        if (class_level) {
            params.push(class_level);
            where.push(`class_level = $${params.length}`);
        }

        if (room) {
            params.push(room);
            where.push(`(classroom = $${params.length} OR room = $${params.length})`);
        }

        const result = await pool.query(
            `SELECT id, student_code, first_name, last_name, class_level, classroom, room,
                    photo_url, prefix, gender, status, birthday, phone, address, parent_name, parent_phone
             FROM students
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY student_code ASC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/students:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/students", async (req, res) => {
    try {
        await ensureStudentProfileColumns();
        const { student_code, first_name, last_name, class_level, classroom, room, password, prefix, gender, status, birthday, phone, address, parent_name, parent_phone, photo_url } = req.body;
        if (!student_code) return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸à¸£à¸«à¸±à¸ªà¸™à¸±à¸à¹€à¸£à¸µà¸¢à¸™" });
        const pass = password || "1234";
        const hash = await bcrypt.hash(pass, 10);

        const result = await pool.query(
            `INSERT INTO students(
                student_code, first_name, last_name, password_hash, class_level, classroom, room,
                prefix, gender, status, birthday, phone, address, parent_name, parent_phone, photo_url
             )
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
            [student_code, first_name, last_name, hash, class_level, classroom, room, prefix || null, gender || null, status || null, birthday || null, phone || null, address || null, parent_name || null, parent_phone || null, photo_url || null]
        );

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error("ERROR /director/students POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/students/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await ensureStudentProfileColumns();
        const { student_code, first_name, last_name, class_level, classroom, room, password, prefix, gender, status, birthday, phone, address, parent_name, parent_phone, photo_url } = req.body;

        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }

        if (passwordHash) {
            await pool.query(
                `UPDATE students 
                 SET student_code=$1, first_name=$2, last_name=$3, class_level=$4, classroom=$5, room=$6, password_hash=$7,
                     prefix=$8, gender=$9, status=$10, birthday=$11, phone=$12, address=$13, parent_name=$14, parent_phone=$15, photo_url=$16
                 WHERE id=$17`,
                [student_code, first_name, last_name, class_level, classroom, room, passwordHash, prefix || null, gender || null, status || null, birthday || null, phone || null, address || null, parent_name || null, parent_phone || null, photo_url || null, id]
            );
        } else {
            await pool.query(
                `UPDATE students 
                 SET student_code=$1, first_name=$2, last_name=$3, class_level=$4, classroom=$5, room=$6,
                     prefix=$7, gender=$8, status=$9, birthday=$10, phone=$11, address=$12, parent_name=$13, parent_phone=$14, photo_url=$15
                 WHERE id=$16`,
                [student_code, first_name, last_name, class_level, classroom, room, prefix || null, gender || null, status || null, birthday || null, phone || null, address || null, parent_name || null, parent_phone || null, photo_url || null, id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/students PUT:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/students/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query("BEGIN");
        await client.query("DELETE FROM registrations WHERE student_id=$1", [id]);
        await client.query("DELETE FROM attendance WHERE student_id=$1", [id]);
        await client.query("DELETE FROM grades WHERE student_id=$1", [id]);
        await client.query("DELETE FROM scores WHERE student_id=$1", [id]);
        await client.query("DELETE FROM competency_results WHERE student_id=$1", [id]);
        await client.query("DELETE FROM conduct_logs WHERE student_id=$1", [id]);
        await client.query("DELETE FROM student_conduct WHERE student_id=$1", [id]);
        await client.query("DELETE FROM student_health WHERE student_id=$1", [id]);
        await client.query("DELETE FROM health_records WHERE student_id=$1", [id]);
        await client.query("DELETE FROM students WHERE id=$1", [id]);
        await client.query("COMMIT");
        res.json({ success: true });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("ERROR /director/students DELETE:", err);
        res.status(500).json({ error: "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸™à¸±à¸à¹€à¸£à¸µà¸¢à¸™à¹„à¸”à¹‰" });
    } finally {
        client.release();
    }
});

// TEACHERS CRUD
router.get("/teachers", async (req, res) => {
    try {
        await ensureTeacherProfileColumns();
        const { search } = req.query;
        const q = search ? `%${search}%` : null;
        const result = await pool.query(
            `SELECT id, teacher_code, first_name, last_name, photo_url, prefix, national_id, birthday, gender, blood_group, employment_type, position, academic_rank, department, start_date, end_date, license_no, salary, status, phone, email, line_id
             FROM teachers
             WHERE ($1::text IS NULL OR teacher_code ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)
             ORDER BY teacher_code ASC`,
            [q]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/teachers:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/teachers", async (req, res) => {
    try {
        await ensureTeacherProfileColumns();
        const { teacher_code, first_name, last_name, password, prefix, national_id, birthday, gender, blood_group, employment_type, position, academic_rank, department, start_date, end_date, license_no, salary, status, phone, email, line_id, photo_url } = req.body;
        if (!teacher_code) return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸à¸£à¸«à¸±à¸ªà¸„à¸£à¸¹" });
        const pass = password || "1234";
        const hash = await bcrypt.hash(pass, 10);

        const result = await pool.query(
            `INSERT INTO teachers(
                teacher_code, first_name, last_name, password_hash, prefix, national_id, birthday, gender, blood_group,
                employment_type, position, academic_rank, department, start_date, end_date, license_no, salary, status,
                phone, email, line_id, photo_url
             )
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
            [teacher_code, first_name, last_name, hash, prefix || null, national_id || null, birthday || null, gender || null, blood_group || null, employment_type || null, position || null, academic_rank || null, department || null, start_date || null, end_date || null, license_no || null, salary || null, status || null, phone || null, email || null, line_id || null, photo_url || null]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error("ERROR /director/teachers POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/teachers/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await ensureTeacherProfileColumns();
        const { teacher_code, first_name, last_name, password, prefix, national_id, birthday, gender, blood_group, employment_type, position, academic_rank, department, start_date, end_date, license_no, salary, status, phone, email, line_id, photo_url } = req.body;

        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }

        if (passwordHash) {
            await pool.query(
                `UPDATE teachers 
                 SET teacher_code=$1, first_name=$2, last_name=$3, password_hash=$4,
                     prefix=$5, national_id=$6, birthday=$7, gender=$8, blood_group=$9, employment_type=$10, position=$11,
                     academic_rank=$12, department=$13, start_date=$14, end_date=$15, license_no=$16, salary=$17, status=$18,
                     phone=$19, email=$20, line_id=$21, photo_url=$22
                 WHERE id=$23`,
                [teacher_code, first_name, last_name, passwordHash, prefix || null, national_id || null, birthday || null, gender || null, blood_group || null, employment_type || null, position || null, academic_rank || null, department || null, start_date || null, end_date || null, license_no || null, salary || null, status || null, phone || null, email || null, line_id || null, photo_url || null, id]
            );
        } else {
            await pool.query(
                `UPDATE teachers 
                 SET teacher_code=$1, first_name=$2, last_name=$3,
                     prefix=$4, national_id=$5, birthday=$6, gender=$7, blood_group=$8, employment_type=$9, position=$10,
                     academic_rank=$11, department=$12, start_date=$13, end_date=$14, license_no=$15, salary=$16, status=$17,
                     phone=$18, email=$19, line_id=$20, photo_url=$21
                 WHERE id=$22`,
                [teacher_code, first_name, last_name, prefix || null, national_id || null, birthday || null, gender || null, blood_group || null, employment_type || null, position || null, academic_rank || null, department || null, start_date || null, end_date || null, license_no || null, salary || null, status || null, phone || null, email || null, line_id || null, photo_url || null, id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/teachers PUT:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/teachers/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM teachers WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/teachers DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ADVISOR (TEACHER ADVISORS)
async function ensureAdvisorColumns() {
    await pool.query(`
        ALTER TABLE teacher_advisors
            ADD COLUMN IF NOT EXISTS room VARCHAR(10)
    `);

    // Drop old unique key that blocks same class-level with different rooms.
    await pool.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'teacher_advisors_class_level_year_semester_key'
            ) THEN
                ALTER TABLE teacher_advisors
                DROP CONSTRAINT teacher_advisors_class_level_year_semester_key;
            END IF;
        END $$;
    `);
}

router.get("/advisors", async (req, res) => {
    try {
        await ensureAdvisorColumns();
        const { year, semester, class_level, room } = req.query;
        const params = [];
        const where = [];

        if (year) {
            params.push(year);
            where.push(`ta.year = $${params.length}`);
        }

        if (semester) {
            params.push(semester);
            where.push(`ta.semester = $${params.length}`);
        }

        if (class_level) {
            params.push(class_level);
            where.push(`ta.class_level = $${params.length}`);
        }
        if (room) {
            params.push(room);
            where.push(`ta.room = $${params.length}`);
        }

        const result = await pool.query(
            `SELECT ta.id, ta.class_level, ta.room, ta.year, ta.semester,
                    t.id AS teacher_id, t.teacher_code, t.first_name, t.last_name
             FROM teacher_advisors ta
             JOIN teachers t ON ta.teacher_id = t.id
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY ta.year DESC, ta.semester DESC, ta.class_level ASC, ta.room ASC`,
            params
        );

        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/advisors GET:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/advisors", async (req, res) => {
    try {
        await ensureAdvisorColumns();
        const { teacher_id, class_level, room, year, semester } = req.body;
        if (!teacher_id || !class_level || !room || !year || !semester) {
            return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹ƒà¸«à¹‰à¸„à¸£à¸šà¸–à¹‰à¸§à¸™" });
        }

        // Upsert without depending on a unique index that may not exist in older databases.
        const existing = await pool.query(
            `SELECT id
             FROM teacher_advisors
             WHERE class_level=$1 AND room=$2 AND year=$3 AND semester=$4
             LIMIT 1`,
            [class_level, room, year, semester]
        );

        let result;
        if (existing.rows.length) {
            result = await pool.query(
                `UPDATE teacher_advisors
                 SET teacher_id=$1
                 WHERE id=$2
                 RETURNING id`,
                [teacher_id, existing.rows[0].id]
            );
        } else {
            result = await pool.query(
                `INSERT INTO teacher_advisors(teacher_id, class_level, room, year, semester)
                 VALUES($1,$2,$3,$4,$5)
                 RETURNING id`,
                [teacher_id, class_level, room, year, semester]
            );
        }

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error("ERROR /director/advisors POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/advisors/:id", async (req, res) => {
    try {
        await ensureAdvisorColumns();
        const { id } = req.params;
        const { teacher_id, class_level, room, year, semester } = req.body;
        if (!teacher_id || !class_level || !room || !year || !semester) {
            return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹ƒà¸«à¹‰à¸„à¸£à¸šà¸–à¹‰à¸§à¸™" });
        }

        await pool.query(
            `UPDATE teacher_advisors
             SET teacher_id=$1, class_level=$2, room=$3, year=$4, semester=$5
             WHERE id=$6`,
            [teacher_id, class_level, room, year, semester, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/advisors PUT:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/advisors/:id", async (req, res) => {
    try {
        await ensureAdvisorColumns();
        const { id } = req.params;
        await pool.query("DELETE FROM teacher_advisors WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/advisors DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// SUBJECTS CRUD
async function ensureSubjectColumns() {
    await pool.query(`
        ALTER TABLE subjects
            ADD COLUMN IF NOT EXISTS name_th VARCHAR(255),
            ADD COLUMN IF NOT EXISTS name_en VARCHAR(255),
            ADD COLUMN IF NOT EXISTS subject_type VARCHAR(50),
            ADD COLUMN IF NOT EXISTS subject_group VARCHAR(100),
            ADD COLUMN IF NOT EXISTS level VARCHAR(50),
            ADD COLUMN IF NOT EXISTS total_hours INTEGER,
            ADD COLUMN IF NOT EXISTS description TEXT,
            ADD COLUMN IF NOT EXISTS year INTEGER,
            ADD COLUMN IF NOT EXISTS semester INTEGER
    `);
}

router.get("/subjects", async (req, res) => {
    try {
        await ensureSubjectColumns();
        const { search, level, group, type, year, semester } = req.query;
        const params = [];
        const where = [];

        if (search) {
            params.push(`%${search}%`);
            where.push(`(subject_code ILIKE $${params.length} OR name ILIKE $${params.length} OR name_th ILIKE $${params.length} OR name_en ILIKE $${params.length})`);
        } else {
            // Only filter by year/semester if NOT searching
            if (year) {
                params.push(Number(year));
                where.push(`year = $${params.length}`);
            }
            if (semester) {
                params.push(Number(semester));
                where.push(`semester = $${params.length}`);
            }
        }

        if (level) {
            params.push(level);
            where.push(`level = $${params.length}`);
        }
        if (group) {
            params.push(group);
            where.push(`subject_group = $${params.length}`);
        }
        if (type) {
            params.push(type);
            where.push(`subject_type = $${params.length}`);
        }

        const result = await pool.query(
            `SELECT id, subject_code, name, name_th, name_en, credit, total_hours, subject_type, subject_group, level, description, year, semester
             FROM subjects
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY subject_code ASC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/subjects:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/subjects", async (req, res) => {
    try {
        await ensureSubjectColumns();
        const {
            subject_code,
            name,
            name_th,
            name_en,
            subject_type,
            subject_group,
            level,
            credit,
            total_hours,
            description,
            year,
            semester
        } = req.body;

        const finalNameTh = (name_th || name_en || name || "").trim();
        if (!subject_code || !finalNameTh) {
            return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ (รหัสวิชา และชื่อวิชา)" });
        }

        const result = await pool.query(
            `INSERT INTO subjects(
                subject_code, name, name_th, name_en, credit, total_hours,
                subject_type, subject_group, level, description, year, semester
            )
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING id`,
            [
                subject_code,
                finalNameTh,
                finalNameTh,
                name_en || null,
                Number(credit || 0),
                Number(total_hours || 0),
                subject_type || null,
                subject_group || null,
                level || null,
                description || null,
                year ? Number(year) : null,
                semester ? Number(semester) : null
            ]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        if (err.code === "23505") {
            return res.status(400).json({ error: "รหัสวิชานี้มีอยู่ในระบบแล้ว" });
        }
        console.error("ERROR /director/subjects POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/subjects/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await ensureSubjectColumns();
        const { subject_code, name_th, name_en, subject_type, subject_group, level, credit, total_hours, description, year, semester } = req.body;
        await pool.query(
            `UPDATE subjects
             SET subject_code=$1, name=$2, name_th=$3, name_en=$4, credit=$5, total_hours=$6,
                 subject_type=$7, subject_group=$8, level=$9, description=$10, year=$11, semester=$12
             WHERE id=$13`,
            [subject_code, name_th, name_th, name_en || null, credit || 0, total_hours || 0, subject_type || null, subject_group || null, level || null, description || null, year || null, semester || null, id]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.code === "23505") {
            return res.status(400).json({ error: "รหัสวิชานี้มีอยู่ในระบบแล้ว" });
        }
        console.error("ERROR /director/subjects PUT:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/subjects/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM subjects WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/subjects DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// SECTIONS / CURRICULUM
router.get("/sections", async (req, res) => {
    try {
        const { year, semester, search } = req.query;
        const params = [];
        const where = [];

        if (year) {
            params.push(Number(year));
            where.push(`ss.year = $${params.length}`);
        }
        if (semester) {
            params.push(Number(semester));
            where.push(`ss.semester = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            where.push(`s.subject_code ILIKE $${params.length}`);
        }

        const result = await pool.query(
            `SELECT ss.*, s.subject_code, s.name AS subject_name,
                    t.first_name || ' ' || t.last_name AS teacher_name
             FROM subject_sections ss
             LEFT JOIN subjects s ON ss.subject_id = s.id
             LEFT JOIN teachers t ON ss.teacher_id = t.id
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY ss.year DESC, ss.semester DESC, ss.id DESC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/sections:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/sections", async (req, res) => {
    try {
        const { subject_id, teacher_id, year, semester, class_level, classroom, day_of_week, time_range, room } = req.body;
        const result = await pool.query(
            `INSERT INTO subject_sections(subject_id, teacher_id, year, semester, class_level, classroom, day_of_week, time_range, room)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [subject_id, teacher_id, year, semester, class_level, classroom, day_of_week, time_range, room]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error("ERROR /director/sections POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/sections/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { subject_id, teacher_id, year, semester, class_level, classroom, day_of_week, time_range, room } = req.body;
        await pool.query(
            `UPDATE subject_sections
             SET subject_id=$1, teacher_id=$2, year=$3, semester=$4, class_level=$5, classroom=$6, day_of_week=$7, time_range=$8, room=$9
             WHERE id=$10`,
            [subject_id, teacher_id, year, semester, class_level, classroom, day_of_week, time_range, room, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/sections PUT:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/sections/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query("BEGIN");

        // Delete scores that belong to score_items of this section
        await client.query(
            `DELETE FROM scores WHERE item_id IN (SELECT id FROM score_items WHERE section_id = $1)`,
            [id]
        );
        // Delete score headers
        await client.query("DELETE FROM score_items WHERE section_id = $1", [id]);
        // Delete grades
        await client.query("DELETE FROM grades WHERE section_id = $1", [id]);
        // Delete grade thresholds
        await client.query("DELETE FROM grade_thresholds WHERE section_id = $1", [id]);
        // Delete registrations
        await client.query("DELETE FROM registrations WHERE section_id = $1", [id]);
        // Finally delete the section itself
        await client.query("DELETE FROM subject_sections WHERE id = $1", [id]);

        await client.query("COMMIT");
        res.json({ success: true });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("ERROR /director/sections DELETE:", err);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});

// ACTIVITIES CRUD
async function ensureActivityColumns() {
    await pool.query(
        "ALTER TABLE school_activities ADD COLUMN IF NOT EXISTS note TEXT"
    );
    await pool.query(
        "ALTER TABLE school_activities ADD COLUMN IF NOT EXISTS category VARCHAR(50)"
    );
}

router.get("/activities", async (req, res) => {
    try {
        await ensureActivityColumns();
        const result = await pool.query(
            "SELECT * FROM school_activities ORDER BY date DESC, id DESC"
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/activities:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/activities", async (req, res) => {
    try {
        await ensureActivityColumns();
        const { name, date, location, note, category } = req.body;
        if (!name || !date) return res.status(400).json({ error: "????????????" });
        const result = await pool.query(
            `INSERT INTO school_activities(name, date, location, note, category)
             VALUES($1,$2,$3,$4,$5) RETURNING id`,
            [name, date, location || "", note || "", category || ""]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error("ERROR /director/activities POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/activities/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await ensureActivityColumns();
        const { name, date, location, note, category } = req.body;
        if (!name || !date) return res.status(400).json({ error: "????????????" });
        await pool.query(
            `UPDATE school_activities SET name=$1, date=$2, location=$3, note=$4, category=$5 WHERE id=$6`,
            [name, date, location || "", note || "", category || "", id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/activities PUT:", err);
        res.status(500).json({ error: "Server error" });
    }
});


router.delete("/activities/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM school_activities WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/activities DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// PROJECTS
async function ensureProjectTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            year INTEGER,
            semester INTEGER,
            objective TEXT,
            department VARCHAR(150),
            budget_total NUMERIC(12,2) DEFAULT 0,
            budget_used NUMERIC(12,2) DEFAULT 0,
            quantity_target INTEGER DEFAULT 0,
            quantity_actual INTEGER DEFAULT 0,
            quality_score INTEGER DEFAULT 0,
            kpi_score INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

router.get("/projects", async (req, res) => {
    try {
        await ensureProjectTable();
        const { year, semester } = req.query;
        const params = [];
        const where = [];
        if (year) {
            params.push(Number(year));
            where.push(`year = $${params.length}`);
        }
        if (semester) {
            params.push(Number(semester));
            where.push(`semester = $${params.length}`);
        }
        const result = await pool.query(
            `SELECT * FROM projects
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY year DESC, semester DESC, id DESC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/projects GET:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/projects", async (req, res) => {
    try {
        await ensureProjectTable();
        const {
            name,
            year,
            semester,
            objective,
            department,
            budget_total,
            budget_used,
            quantity_target,
            quantity_actual,
            quality_score,
            kpi_score
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸£à¸°à¸šà¸¸à¸Šà¸·à¹ˆà¸­à¹‚à¸„à¸£à¸‡à¸à¸²à¸£" });
        }

        const result = await pool.query(
            `INSERT INTO projects
             (name, year, semester, objective, department, budget_total, budget_used,
              quantity_target, quantity_actual, quality_score, kpi_score)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id`,
            [
                name,
                year || null,
                semester || null,
                objective || "",
                department || "",
                budget_total || 0,
                budget_used || 0,
                quantity_target || 0,
                quantity_actual || 0,
                quality_score || 0,
                kpi_score || 0
            ]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error("ERROR /director/projects POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/projects/:id", async (req, res) => {
    try {
        await ensureProjectTable();
        const { id } = req.params;
        const {
            name,
            year,
            semester,
            objective,
            department,
            budget_total,
            budget_used,
            quantity_target,
            quantity_actual,
            quality_score,
            kpi_score
        } = req.body;

        await pool.query(
            `UPDATE projects
             SET name=$1, year=$2, semester=$3, objective=$4, department=$5,
                 budget_total=$6, budget_used=$7, quantity_target=$8, quantity_actual=$9,
                 quality_score=$10, kpi_score=$11
             WHERE id=$12`,
            [
                name,
                year || null,
                semester || null,
                objective || "",
                department || "",
                budget_total || 0,
                budget_used || 0,
                quantity_target || 0,
                quantity_actual || 0,
                quality_score || 0,
                kpi_score || 0,
                id
            ]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/projects PUT:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/projects/:id", async (req, res) => {
    try {
        await ensureProjectTable();
        const { id } = req.params;
        await pool.query("DELETE FROM projects WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/projects DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// DUTY TEACHERS
async function ensureDutyTeacherTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS duty_teachers (
            id SERIAL PRIMARY KEY,
            week_start DATE NOT NULL,
            teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (week_start, teacher_id)
        )
    `);
}

router.get("/duty-teachers", async (req, res) => {
    try {
        await ensureDutyTeacherTable();
        const { week_start } = req.query;
        if (!week_start) return res.json([]);
        const result = await pool.query(
            `SELECT dt.id, dt.week_start, dt.teacher_id,
                    t.first_name || ' ' || t.last_name AS teacher_name
             FROM duty_teachers dt
             JOIN teachers t ON dt.teacher_id = t.id
             WHERE dt.week_start = $1
             ORDER BY t.first_name ASC`,
            [week_start]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/duty-teachers GET:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/duty-teachers", async (req, res) => {
    try {
        await ensureDutyTeacherTable();
        const { week_start, teacher_id } = req.body;
        if (!week_start || !teacher_id) return res.status(400).json({ error: "????????????" });
        const result = await pool.query(
            `INSERT INTO duty_teachers(week_start, teacher_id)
             VALUES($1,$2)
             ON CONFLICT (week_start, teacher_id) DO NOTHING
             RETURNING id`,
            [week_start, teacher_id]
        );
        res.json({ success: true, id: result.rows[0]?.id || null });
    } catch (err) {
        console.error("ERROR /director/duty-teachers POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/duty-teachers/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM duty_teachers WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/duty-teachers DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// EVALUATION SUMMARY
async function ensureCompetencyTopicsTable() {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS competency_topics (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            year INTEGER NOT NULL,
            semester INTEGER NOT NULL,
            order_index INTEGER DEFAULT 0,
            avg_score NUMERIC(5,2),
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (name, year, semester)
        )`
    );
    await pool.query(
        `ALTER TABLE competency_topics
         ADD COLUMN IF NOT EXISTS avg_score NUMERIC(5,2)`
    );
}

async function seedTopicsFromResults(year, semester) {
    if (!year || !semester) return;
    const existing = await pool.query(
        `SELECT COUNT(*) AS total FROM competency_topics WHERE year=$1 AND semester=$2`,
        [year, semester]
    );
    if (Number(existing.rows[0].total || 0) > 0) return;

    const result = await pool.query(
        `SELECT DISTINCT name
         FROM competency_results
         WHERE year=$1 AND semester=$2
         ORDER BY name ASC`,
        [year, semester]
    );
    if (!result.rows.length) return;

    const params = [];
    const values = result.rows.map((row, index) => {
        params.push(row.name, year, semester, index + 1);
        return `($${params.length - 3},$${params.length - 2},$${params.length - 1},$${params.length})`;
    });
    await pool.query(
        `INSERT INTO competency_topics(name, year, semester, order_index)
         VALUES ${values.join(", ")}`,
        params
    );
}

router.get("/evaluation/summary", async (req, res) => {
    try {
        const { year, semester } = req.query;
        await ensureCompetencyTopicsTable();
        await seedTopicsFromResults(year, semester);

        const params = [];
        const where = [];
        if (year) {
            params.push(year);
            where.push(`t.year=$${params.length}`);
        }
        if (semester) {
            params.push(semester);
            where.push(`t.semester=$${params.length}`);
        }

        const result = await pool.query(
            `SELECT t.name,
                    COALESCE(ROUND(AVG(r.score)::numeric, 2), t.avg_score, 0) AS avg_score
             FROM competency_topics t
             LEFT JOIN competency_results r
               ON r.name = t.name AND r.year = t.year AND r.semester = t.semester
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             GROUP BY t.name, t.avg_score, t.order_index
             ORDER BY t.order_index ASC, t.name ASC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/evaluation/summary:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// CLASSROOM MASTER
router.get("/classrooms", async (req, res) => {
    try {
        await ensureClassroomMaster();
        const { class_level } = req.query;
        const params = [];
        let where = "";
        if (class_level) {
            params.push(class_level);
            where = `WHERE class_level = $1`;
        }
        const result = await pool.query(
            `SELECT id, class_level, room
             FROM classroom_master
             ${where}
             ORDER BY class_level ASC, room ASC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/classrooms GET:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/classrooms", async (req, res) => {
    try {
        await ensureClassroomMaster();
        const classLevel = String(req.body?.class_level || "").trim();
        const room = String(req.body?.room || "").trim();
        if (!classLevel || !room) {
            return res.status(400).json({ error: "class_level and room are required" });
        }
        const result = await pool.query(
            `INSERT INTO classroom_master(class_level, room)
             VALUES ($1, $2)
             ON CONFLICT (class_level, room) DO UPDATE
             SET class_level = EXCLUDED.class_level
             RETURNING id, class_level, room`,
            [classLevel, room]
        );
        res.json({ success: true, classroom: result.rows[0] });
    } catch (err) {
        console.error("ERROR /director/classrooms POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/classrooms/:id", async (req, res) => {
    try {
        await ensureClassroomMaster();
        const { id } = req.params;
        await pool.query("DELETE FROM classroom_master WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/classrooms DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/evaluation/topics", async (req, res) => {
    try {
        const { year, semester } = req.query;
        await ensureCompetencyTopicsTable();
        await seedTopicsFromResults(year, semester);

        const params = [];
        const where = [];
        if (year) {
            params.push(year);
            where.push(`t.year=$${params.length}`);
        }
        if (semester) {
            params.push(semester);
            where.push(`t.semester=$${params.length}`);
        }

        const result = await pool.query(
            `SELECT t.id, t.name, t.year, t.semester,
                    COALESCE(ROUND(AVG(r.score)::numeric, 2), t.avg_score, 0) AS avg_score,
                    COUNT(r.score) AS total
             FROM competency_topics t
             LEFT JOIN competency_results r
               ON r.name = t.name AND r.year = t.year AND r.semester = t.semester
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             GROUP BY t.id, t.name, t.year, t.semester
             ORDER BY t.order_index ASC, t.id ASC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/evaluation/topics:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/evaluation/topics", async (req, res) => {
    try {
        const { director_code, password, name, year, semester, avg_score } = req.body;
        const auth = await verifyDirectorPassword(director_code, password);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.message });

        if (!name || !year || !semester) {
            return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸£à¸°à¸šà¸¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹ƒà¸«à¹‰à¸„à¸£à¸š" });
        }

        const parsedAvg = avg_score === "" || avg_score === null || typeof avg_score === "undefined"
            ? null
            : Number(avg_score);

        await ensureCompetencyTopicsTable();
        const result = await pool.query(
            `INSERT INTO competency_topics(name, year, semester, order_index, avg_score)
             VALUES($1,$2,$3,
                (SELECT COALESCE(MAX(order_index),0) + 1 FROM competency_topics WHERE year=$2 AND semester=$3)
             , $4)
             ON CONFLICT (name, year, semester)
             DO UPDATE SET avg_score = COALESCE(EXCLUDED.avg_score, competency_topics.avg_score)
             RETURNING id`,
            [name, year, semester, Number.isFinite(parsedAvg) ? parsedAvg : null]
        );
        res.json({ success: true, id: result.rows[0]?.id || null });
    } catch (err) {
        console.error("ERROR /director/evaluation/topics POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/evaluation/student", async (req, res) => {
    try {
        const { student_id, year, semester } = req.query;
        if (!student_id || !year || !semester) {
            return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸£à¸°à¸šà¸¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹ƒà¸«à¹‰à¸„à¸£à¸š" });
        }

        const result = await pool.query(
            `SELECT id, name, score
             FROM competency_results
             WHERE student_id=$1 AND year=$2 AND semester=$3
             ORDER BY id ASC`,
            [student_id, year, semester]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/evaluation/student:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/evaluation/student", async (req, res) => {
    try {
        const { director_code, password, student_id, year, semester, data } = req.body;
        const auth = await verifyDirectorPassword(director_code, password);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.message });

        if (!student_id || !year || !semester || !Array.isArray(data)) {
            return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸£à¸°à¸šà¸¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹ƒà¸«à¹‰à¸„à¸£à¸š" });
        }

        await pool.query(
            `DELETE FROM competency_results WHERE student_id=$1 AND year=$2 AND semester=$3`,
            [student_id, year, semester]
        );

        for (const item of data) {
            if (!item.name) continue;
            await pool.query(
                `INSERT INTO competency_results(student_id, name, score, year, semester)
                 VALUES($1,$2,$3,$4,$5)`,
                [student_id, item.name, item.score ?? null, year, semester]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/evaluation/student POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/evaluation/topics/rename", async (req, res) => {
    try {
        const { director_code, password, old_name, new_name, year, semester } = req.body;
        const auth = await verifyDirectorPassword(director_code, password);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.message });

        if (!old_name || !new_name || !year || !semester) {
            return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸£à¸°à¸šà¸¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹ƒà¸«à¹‰à¸„à¸£à¸š" });
        }

        await ensureCompetencyTopicsTable();

        const topicUpdate = await pool.query(
            `UPDATE competency_topics
             SET name=$1
             WHERE name=$2 AND year=$3 AND semester=$4`,
            [new_name, old_name, year, semester]
        );

        const result = await pool.query(
            `UPDATE competency_results
             SET name=$1
             WHERE name=$2 AND year=$3 AND semester=$4`,
            [new_name, old_name, year, semester]
        );
        res.json({ success: true, updated: result.rowCount, topics: topicUpdate.rowCount });
    } catch (err) {
        console.error("ERROR /director/evaluation/topics/rename:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/evaluation/topics", async (req, res) => {
    try {
        const { director_code, password, name, year, semester } = req.body;
        const auth = await verifyDirectorPassword(director_code, password);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.message });

        if (!name || !year || !semester) {
            return res.status(400).json({ error: "à¸à¸£à¸¸à¸“à¸²à¸£à¸°à¸šà¸¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹ƒà¸«à¹‰à¸„à¸£à¸š" });
        }

        await ensureCompetencyTopicsTable();

        const topicDelete = await pool.query(
            `DELETE FROM competency_topics WHERE name=$1 AND year=$2 AND semester=$3`,
            [name, year, semester]
        );
        const result = await pool.query(
            `DELETE FROM competency_results WHERE name=$1 AND year=$2 AND semester=$3`,
            [name, year, semester]
        );
        res.json({ success: true, deleted: result.rowCount, topics: topicDelete.rowCount });
    } catch (err) {
        console.error("ERROR /director/evaluation/topics DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// FINANCE CRUD
router.get("/finance", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM finance_records ORDER BY record_date DESC, id DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/finance:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.post("/finance", async (req, res) => {
    try {
        const { title, category, amount, type, record_date, note } = req.body;
        if (!title || !amount || !type || !record_date) {
            return res.status(400).json({ error: "à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹„à¸¡à¹ˆà¸„à¸£à¸š" });
        }
        const result = await pool.query(
            `INSERT INTO finance_records(title, category, amount, type, record_date, note)
             VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
            [title, category || "", amount, type, record_date, note || ""]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error("ERROR /director/finance POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/finance/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { title, category, amount, type, record_date, note } = req.body;
        await pool.query(
            `UPDATE finance_records
             SET title=$1, category=$2, amount=$3, type=$4, record_date=$5, note=$6
             WHERE id=$7`,
            [title, category, amount, type, record_date, note, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/finance PUT:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/finance/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM finance_records WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR /director/finance DELETE:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// REPORTS
router.get("/reports/student-count", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT class_level, COALESCE(classroom, room) AS room, gender, COUNT(*) AS total
             FROM students
             GROUP BY class_level, COALESCE(classroom, room), gender
             ORDER BY class_level, room`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR /director/reports/student-count:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// REPORTS: attendance summary (late/absent/leave)
router.get("/reports/attendance-summary", async (req, res) => {
    try {
        const days = Math.max(1, Number(req.query.days || 5));
        const result = await pool.query(
            `SELECT
                SUM(CASE WHEN status ILIKE 'à¸ªà¸²à¸¢%' THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN status ILIKE 'à¸‚à¸²à¸”%' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN status ILIKE 'à¸¥à¸²%' THEN 1 ELSE 0 END) AS leave
             FROM teacher_attendance
             WHERE date >= CURRENT_DATE - ($1::int - 1)`,
            [days]
        );
        res.json({
            late: Number(result.rows[0].late || 0),
            absent: Number(result.rows[0].absent || 0),
            leave: Number(result.rows[0].leave || 0)
        });
    } catch (err) {
        console.error("ERROR /director/reports/attendance-summary:", err);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;

