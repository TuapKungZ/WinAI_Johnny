import pool from "./db/pool.js";

async function checkFinance() {
    try {
        const res = await pool.query("SELECT * FROM finance_records");
        console.log("Total records:", res.rows.length);
        console.log("Sample rows:", res.rows.slice(0, 5));

        const types = await pool.query("SELECT DISTINCT type FROM finance_records");
        console.log("Distinct types:", types.rows);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        pool.end();
    }
}

checkFinance();
