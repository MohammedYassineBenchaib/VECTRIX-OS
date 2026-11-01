import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/build/**", "**/coverage/**"],
  },
);
