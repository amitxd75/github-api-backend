const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = [
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es2020,
			},
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: "module",
			},
		},
		rules: {
			// TypeScript specific rules
			"@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-non-null-assertion": "warn",

			// General rules
			"no-console": "off", // Allow console.log for server logging
			"prefer-const": "error",
			"no-var": "error",
			"no-unused-vars": "off", // Use TypeScript version instead
		},
	},
	{
		ignores: [
			"dist/",
			"node_modules/",
			"*.js",
			"*.d.ts",
		],
	},
];
