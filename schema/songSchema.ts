export const SONG_SCHEMA = {
  name: "song_plan",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      meta: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string" },
          level: { enum: ["beginner", "intermediate", "advanced"] },
          locale: { type: "string" }
        },
        required: ["topic", "level", "locale"]
      },
      S: {
        type: "object",
        additionalProperties: false,
        properties: {
          oneLine: { type: "string" },
          bullets: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          goals:   { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 }
        },
        required: ["oneLine", "bullets", "goals"]
      },
      O: {
        type: "object",
        additionalProperties: false,
        properties: {
          conceptPoints: { type: "array", items: { type: "string" }, minItems: 3 },
          prerequisites: { type: "array", items: { type: "string" } }
        },
        required: ["conceptPoints"]
      },
      N: {
        type: "object",
        additionalProperties: false,
        properties: {
          misconceptions: {
            type: "array",
            minItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                statement:          { type: "string" },
                diagnosticQuestion: { type: "string" },
                checkpoint:         { type: "string" },
                fix:                { type: "string" }
              },
              required: ["statement", "diagnosticQuestion", "checkpoint", "fix"]
            }
          }
        },
        required: ["misconceptions"]
      },
      G: {
        type: "object",
        additionalProperties: false,
        properties: {
          practice: {
            type: "object",
            additionalProperties: false,
            properties: {
              intro:        { $ref: "#/definitions/itemArray" },
              intermediate: { $ref: "#/definitions/itemArray" },
              applied:      { $ref: "#/definitions/itemArray" }
            },
            required: ["intro"]
          },
          wrapup: {
            type: "object",
            additionalProperties: false,
            properties: {
              recap: { type: "string" },
              keywords: { type: "array", items: { type: "string" }, minItems: 3 },
              nextSteps: { type: "array", items: { type: "string" } }
            },
            required: ["recap", "keywords"]
          }
        },
        required: ["practice", "wrapup"],
        definitions: {
          itemArray: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                q: { type: "string" },
                hints: { type: "array", items: { type: "string" } },
                solution: { type: "string" }
              },
              required: ["q", "solution"]
            }
          }
        }
      },
      a11y: {
        type: "object",
        additionalProperties: false,
        properties: {
          ttsPlainText: { type: "string" },
          fontSize: { enum: ["sm", "md", "lg"] }
        }
      }
    },
    required: ["meta", "S", "O", "N", "G"]
  },
  strict: true
} as const;
