import "dotenv/config";
import app from "./app.js";
import prisma from "./lib/prisma.js";

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT,()=>{
  console.log(`Server is running on port ${PORT}`)
});

// Optional: Handle graceful shutdowns for database connections
const shutdown = async () => {
  console.log("Shutting down server gracefully...");

  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await prisma.close();
      console.log("Database connection closed.");
      process.exit(0);
    } catch (err) {
      console.error("Error during database disconnection:", err);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
