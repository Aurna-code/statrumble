import assert from "node:assert/strict";
import { refereeJsonSchema } from "../statrumble/lib/referee/schema.ts";

const properties = refereeJsonSchema.properties;
const required = refereeJsonSchema.required;

assert.ok(properties && typeof properties === "object", "refereeJsonSchema.properties must be an object");
assert.ok(Array.isArray(required), "refereeJsonSchema.required must be an array");

const propertyKeys = Object.keys(properties);
const requiredSet = new Set(required);
const missingRequired = propertyKeys.filter((key) => !requiredSet.has(key));

assert.deepEqual(missingRequired, [], `required is missing property keys: ${missingRequired.join(", ")}`);

const demoNote = properties.demo_note;
assert.ok(
  demoNote && typeof demoNote === "object" && Array.isArray(demoNote.type),
  "demo_note must define a union type array",
);
assert.ok(demoNote.type.includes("null"), "demo_note type must include null");

console.log("verify-referee-schema: OK");
