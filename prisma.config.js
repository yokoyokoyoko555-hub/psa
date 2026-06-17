"use strict";
const path = require("path");

// Try to load defineConfig from the installed prisma package first (Railway/production),
// fall back to the local npx cache (local dev on this machine).
let defineConfig;
try {
  // When prisma@7 is installed via npm, this resolves normally
  defineConfig = require("prisma/config").defineConfig;
} catch {
  // Local dev fallback: use cached Prisma v7 in npx cache
  const PRISMA_CACHE = "C:/Users/user/AppData/Local/npm-cache/_npx/2778af9cee32ff87/node_modules";
  defineConfig = require(PRISMA_CACHE + "/prisma/config.js").defineConfig;
}

module.exports = defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, "prisma/schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
