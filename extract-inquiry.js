import { GoogleGenAI } from "@google/genai";

const inquirySchema = {
  type: "object",
  properties: {
    customer_name: {
      type: ["string", "null"],
      description: "Company or customer name"
    },
    contact_name: {
      type: ["string", "null"],
      description: "Individual contact person's name"
    },
    contact_phone: {
      type: ["string", "null"],
      description: "Phone or mobile number"
    },
    contact_email: {
      type: ["string", "null"],
      description: "Email address"
    },
    requirement: {
      type: ["string", "null"],
      description: "Short overall requirement summary"
    },
    expected_delivery_date: {
      type: ["string", "null"],
      description: "Expected delivery date in YYYY-MM-DD format"
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
      type: ["string", "null"]
    },
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_name: {
            type: ["string", "null"]
          },
          description: {
            type: ["string", "null"]
          },
          quantity: {
            type: ["number", "null"]
          },
          unit: {
            type: "string"
          },
          budget_per_unit: {
            type: ["number", "null"]
          },
          total_budget: {
            type: ["number", "null"]
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

const extractionPrompt = `
You are an expert sales inquiry extraction assistant for
Gifting Delight Private Limited.

Extract structured information from the customer's inquiry.

IMPORTANT RULES:

1. Do NOT invent information.
2. If information is not present, return null.
3. Clearly distinguish the company/customer name from the contact person's name.
4. Extract phone and email exactly when present.
5. Extract EVERY distinct product requested.
6. One inquiry may contain multiple products.
7. NEVER combine different products into one product.
8. Quantity must be extracted separately for each product.
9. Budget must be extracted separately for each product.
10. If the inquiry says:
   "Shivam from Wipro Industries has given an order of
   500 T-shirts of Arrow for budget of Rs 900"
   then:
   customer_name = Wipro Industries
   contact_name = Shivam
   product_name should identify the requested product/brand,
   quantity = 500,
   and budget_per_unit = 900 only if the wording indicates
   Rs 900 is the per-unit budget.
11. Do not assume that a number is a budget unless the text indicates it.
12. Preserve brand names and product specifications.
13. If several products are requested, create separate product objects.
14. Understand Hindi, Hinglish, Marathi and mixed-language inquiries.
15. requirement should be a SHORT overall summary.
16. Do not put the entire original message into requirement.
17. Convert an explicitly stated delivery date to YYYY-MM-DD.
18. Do not create inquiry_date. The application will set it automatically.
19. Do not guess a missing customer name, contact name, quantity,
    product or budget.
20. Return only the requested structured JSON.
`;

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: "Method not allowed"
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const body = await request.json();

    const text = body?.text || "";
    const imageBase64 = body?.imageBase64 || "";
    const imageMimeType = body?.imageMimeType || "";

    if (!text.trim() && !imageBase64) {
      return new Response(
        JSON.stringify({
          error: "Please provide inquiry text or an image."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY is not configured in Netlify."
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const ai = new GoogleGenAI({
      apiKey
    });

    const contents = [];

    contents.push({
      text:
        extractionPrompt +
        "\n\nCUSTOMER INQUIRY:\n" +
        (text.trim() || "(The inquiry is contained in the attached image.)")
    });

    if (imageBase64 && imageMimeType) {
      contents.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents,
      config: {
        responseFormat: {
          text: {
            mimeType: "application/json",
            schema: inquirySchema
          }
        }
      }
    });

    const responseText = response.text;

    if (!responseText) {
      throw new Error("Gemini returned an empty response.");
    }

    let extractedData;

    try {
      extractedData = JSON.parse(responseText);
    } catch (error) {
      console.error("Gemini JSON parse error:", responseText);
      throw new Error("Gemini returned invalid JSON.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("Inquiry extraction error:", error);

    return new Response(
      JSON.stringify({
        success: false,
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