
import fetch from 'node-fetch';

async function test() {
    try {
        const response = await fetch('http://localhost:5000/api/director/exams');
        const data = await response.json();
        console.log("Status:", response.status);
        console.log("Data:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error:", error);
    }
}

test();
