
import pool from './db/pool.js';

async function checkTable() {
    try {
        const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'exam_schedule'
        `);
        console.log("Table exists:", res.rows.length > 0);

        if (res.rows.length > 0) {
            const cols = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'exam_schedule'
            `);
            console.log("Columns:", cols.rows);
        }
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkTable();
