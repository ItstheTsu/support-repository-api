import { hashPassword } from "../src/auth.js";

if (!process.stdin.isTTY)
  throw new Error("Execute em um terminal interativo para não expor a senha.");
process.stdout.write("Senha do suporte (mínimo 12 caracteres): ");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
let password = "";
process.stdin.on("data", async (chunk) => {
  for (const char of chunk) {
    if (char === "\u0003") {
      process.stdin.setRawMode(false);
      process.exit(1);
    }
    if (char === "\r" || char === "\n") {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (password.length < 12) {
        console.error("\nUse pelo menos 12 caracteres.");
        process.exit(1);
      }
      console.log(`\nSUPPORT_PASSWORD_HASH=${await hashPassword(password)}`);
      password = "";
      process.exit(0);
    } else if (char === "\u007f" || char === "\b")
      password = password.slice(0, -1);
    else password += char;
  }
});
