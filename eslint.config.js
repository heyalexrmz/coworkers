//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  {
    ignores: [
      "**/.cloudflare/",
      "**/.tanstack/",
      "installer/public/release/",
      "src/routeTree.gen.ts",
    ],
  },
  ...tanstackConfig,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./installer/tsconfig.json"],
      },
    },
    rules: {
      // Keep the repo’s existing import groups and TypeScript notation.
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/method-signature-style": "off",
      // RPCs deliberately preserve async signatures and guard external data
      // even when the declared types say a value is present.
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "no-shadow": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
]
