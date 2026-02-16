const API_BASE = "http://localhost:5000/api";
const FILE_BASE = API_BASE.replace(/\/api$/, "");

window.API_BASE = API_BASE;
window.FILE_BASE = FILE_BASE;

export { API_BASE, FILE_BASE };
