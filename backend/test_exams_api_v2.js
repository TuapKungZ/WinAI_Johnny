
import fetch from 'node-fetch';

async function test() {
    try {
        const response = await fetch('http://localhost:5000/api/director/exams');
        console.log("Status:", response.status);
        if (response.ok) {
            const data = await response.json();
            console.log("Data count:", data.length);
            console.log("Data:", JSON.stringify(data, null, 2));
        } else {
            console.log("Response text:", await response.text());
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

test();
