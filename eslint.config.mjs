// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * 루트 공유 ESLint flat config.
 * 각 패키지는 이 설정을 import해서 필요 시 확장한다.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "docs/**",
      "ee/**",
      "examples/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
