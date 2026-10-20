const app = require("./app");

const PORT = 3001;

// --- Iniciar el Servidor ---
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Servidor corriendo SOLO en http://localhost:${PORT}`);
});
