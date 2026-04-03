const http = require('http');

const performRequest = (url, options, data = null) => {
    return new Promise((resolve, reject) => {
        const req = http.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk.toString());
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
};

async function run() {
    const queryData = {
        structuredQuery: {
            from: [{ collectionId: "WorldEntities", allDescendants: true }],
            limit: 50
        }
    };

    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };

    const result = await performRequest('http://127.0.0.1:8080/v1/projects/decentralized-project/databases/(default)/documents:runQuery', options, queryData);

    if (Array.isArray(result)) {
        console.log("Total Results:", result.length);
        result.forEach(row => {
            if (row.document) {
                const data = row.document.fields;
                console.log(`Document: ${row.document.name}`);
                console.log(`  projectId: ${data.projectId?.stringValue}`);
                console.log(`  category: ${data.category?.stringValue}`);
                console.log(`  tier: ${data.tier?.stringValue}`);
                console.log(`  status: ${data.status?.stringValue}`);
            } else {
                console.log("Empty result row:", row);
            }
        });
    } else {
        console.log("Error or unexpected response:", result);
    }
}

run();
