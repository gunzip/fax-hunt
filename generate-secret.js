const getClientSecret = require("./src/client-secret");

const serverSecret = process.env.SECRET || "foobar";

// Get clientId from command line arguments
const clientId = process.argv[2];

if (!clientId) {
  console.log("Usage: node generate-secret.js <clientid>");
  process.exit(1);
}

// Generate a client secret
const clientSecret = getClientSecret(clientId, serverSecret);

console.log(`Client ID: ${clientId}`);
console.log(`Client Secret: ${clientSecret}`);
