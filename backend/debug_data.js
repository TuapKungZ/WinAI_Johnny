import pool from "./db/pool.js";

async function run() {
    try {
        console.log("--- Subject Sections (Year 2568, Sem 1) - DUPLICATE CHECK ---");
        const res = await pool.query(`
            SELECT s.subject_code, s.name, ss.day_of_week, ss.time_range
            FROM subject_sections ss
            JOIN subjects s ON ss.subject_id = s.id
            WHERE ss.year = 2568 AND ss.semester = 1
            ORDER BY s.subject_code
        `);

        const counts = {};
        res.rows.forEach(r => {
            const key = r.subject_code;
            if (!counts[key]) counts[key] = [];
            counts[key].push(`${r.day_of_week} ${r.time_range}`);
        });

        for (const [code, times] of Object.entries(counts)) {
            if (times.length > 1) {
                console.log(`${code}: ${times.join(" AND ")}`);
            } else {
                // console.log(`${code}: ${times[0]}`); // Commented out to reduce noise
            }
        }

        console.log("\n--- Comparison of raw rows for a multi-row subject ---");
        // find one that has multiple
        const multi = Object.keys(counts).find(k => counts[k].length > 1);
        if (multi) {
            const rows = await pool.query(`
                SELECT ss.id, ss.subject_id, s.subject_code, s.name, ss.day_of_week, ss.time_range
                FROM subject_sections ss
                JOIN subjects s ON ss.subject_id = s.id
                WHERE ss.year = 2568 AND ss.semester = 1 AND s.subject_code = $1
            `, [multi]);
            console.table(rows.rows);
        } else {
            console.log("No subjects with multiple sections found.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

run();
