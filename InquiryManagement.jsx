import { GoogleGenAI } from "@google/genai";

const schema = {
  type: "object",
  properties: {
    customer_name: {
      type: ["string", "null"],
      description: "Company or customer name. Do not confuse it with the contact person's name."
    },
    contact_name: {
      type: ["string", "null"],
      description: "Individual person's name."
    },
    contact_phone: {
      type: ["string", "null"],
      description: "Phone or mobile number."
    },
    contact_email: {
      type: ["string", "null"],
      description: "Email address."
    },
    requirement: {
      type: ["string", "null"],
      description: "Short overall description of the inquiry."
    },
    expected_delivery_date: {
      type: ["string", "null"],
      description: "Expected delivery date in YYYY-MM-DD format if explicitly available."
    },
    source: {
      type: "string",
      enum: [
        "WhatsApp",
        "Email",
        "Phone",
        "Website",
        "Referral",
        "Existing Customer",
        "Other"
      ]
    },
    status: {
      type: "string",
      enum: [
        "New",
        "Contacted",
        "Quotation Sent",
        "Negotiation",
        "Won",
        "Lost",
        "On Hold"
      ]
    },
    notes: {
      type: ["string", "null"],
      description: "Other useful information explicitly present in the inquiry."
    },
    products: {
      type: "array",
      description: "Every distinct product requested by the customer. There may be one or many.",
      items: {
        type: "object",
        properties: {
          product_name: {
            type: ["string", "null"],
            description: "Exact product name, model, brand, or product description stated by the customer."
          },
          description: {
            type: ["string", "null"],
            description: "Additional product specifications such as colour, material, size, printing, branding, etc."
          },
          quantity: {
            type: ["number", "null"],
            description: "Quantity requested for this product."
          },
          unit: {
            type: "string",
            description: "Unit such as pcs, sets, boxes, kg, etc."
          },
          budget_per_unit: {
            type: ["number", "null"],
            description: "Budget per unit if explicitly stated."
          },
          total_budget: {
            type: ["number", "null"],
            description: "Total budget for this product if explicitly stated."
          }
        },
        required: [
          "product_name",
          "description",
          "quantity",
          "unit",
          "budget_per_unit",
          "total_budget"
        ],
        additionalProperties: false
      }
    }
  },
  required: [
    "customer_name",
    "contact_name",
    "contact_phone",
    "contact_email",
    "requirement",
    "expected_delivery_date",
    "source",
    "status",
    "notes",
    "products"
  ],
  additionalProperties: false
};

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const body = await request.json();

    const text = body?.text || "";
    const imageBase64 = body?.imageBase64 || null;
    const imageMimeType = body?.imageMimeType || null;

    if (!text.trim() && !imageBase64) {
      return new Response(
        JSON.stringify({ error: "No inquiry text or image supplied." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY is not configured on the server."
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const ai = new GoogleGenAI({
      apiKey
    });

    const instructions = `
You are an expert sales inquiry data extraction assistant for Gifting Delight Private Limited.

Extract information from the customer's inquiry accurately.

IMPORTANT RULES:

1. Do NOT invent information.
2. If a field is not present, return null.
3. Clearly distinguish the company/customer name from the contact person's name.
4. Extract phone and email exactly when present.
5. Extract every distinct product requested.
6. One inquiry can contain multiple products.
7. Never combine different products into one product.
8. Extract quantity separately for each product.
9. Extract budget separately for each product.
10. If the customer says something such as:
   "500 T-shirts of Arrow for Rs 900"
   then product_name should contain the product/brand information such as "Arrow T-shirt",
   quantity should be 500,
   and budget_per_unit should be 900 if the wording indicates Rs 900 per piece.
11. If the wording clearly gives a total budget rather than a per-unit budget, use total_budget.
12. Do not assume that a number is a budget unless the inquiry indicates it is.
13. Preserve important product specifications such as brand, colour, size, material, printing, logo, packaging, etc.
14. If several products have different quantities or budgets, keep them as separate product objects.
15. Convert an explicitly stated delivery date to YYYY-MM-DD.
16. Do not create an inquiry date. The application will set inquiry_date to today's date.
17. Return only data matching the supplied schema.
18. If the inquiry is in Hindi, Hinglish, Marathi, or mixed language, understand it and extract the information into the English field structure.
19. The "requirement" field should be a concise overall summary, not the entire original message.
20. The "products" array may contain any number of products.
`;

    const input = [];

    input.push({
      type: "text",
      text:
        instructions +
        "\n\nCustomer inquiry:\n" +
        (text.trim() || "(Inquiry supplied through image)")
    });

    if (imageBase64 && imageMimeType) {
      input.push({
        type: "image",
        mime_type: imageMimeType,
        data: imageBase64
      });
    }

    const interaction = await ai.interactions.create({
      model: "gemini-3.8-flash",
      input,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema
      }
    });

    const outputText = interaction?.output_text;

    if (!outputText) {
      throw new Error("Gemini returned an empty response.");
    }

    let extracted;

    try {
      extracted = JSON.parse(outputText);
    } catch (parseError) {
      throw new Error("Gemini returned invalid JSON.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extracted
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("Gemini inquiry extraction error:", error);

    return new Response(
      JSON.stringify({
        error: error?.message || "Unable to extract inquiry."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}