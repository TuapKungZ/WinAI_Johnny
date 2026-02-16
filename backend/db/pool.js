import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  user: "postgres",
  host: "26.47.10.181",
  database: "johny_db",      // <-- ชื่อ DB ของคุณ
  password: "1234",      // <-- รหัส PostgreSQL ของคุณ
  port: 5432,
});

export default pool;  