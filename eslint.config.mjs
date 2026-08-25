import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", ".supergoal/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
];
