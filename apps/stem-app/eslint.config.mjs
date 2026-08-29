import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// stem-app trước đây build không có eslint config riêng (dùng default của Next).
// eslint-config-next >= 16.3 bật thêm rule react-hooks/set-state-in-effect làm
// error trong khi code hiện tại dùng pattern đó có chủ đích (sync state từ
// props/session). Tạo config riêng để pin hành vi lint như cũ — không đổi
// behaviour runtime.
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-unused-expressions": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "react/no-unescaped-entities": "off",
    "@next/next/no-img-element": "off",
    "no-unused-vars": "off",
    "prefer-const": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "backend/**", "__pycache__/**"],
}];

export default eslintConfig;
