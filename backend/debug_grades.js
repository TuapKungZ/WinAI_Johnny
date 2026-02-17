import pool from "./db/pool.js";

async function checkDuplicates() {
    try {
        console.log("Checking for duplicates in grades table...");
        const res = await pool.query(`
            SELECT student_id, section_id, COUNT(*)
            FROM grades
            GROUP BY student_id, section_id
            HAVING COUNT(*) > 1
        `);

        if (res.rows.length > 0) {
            console.log("Found duplicates:", res.rows);
        } else {
            console.log("No duplicates found. Unique constraint likely exists or data is clean.");
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        pool.end();
    }
}

checkDuplicates();
