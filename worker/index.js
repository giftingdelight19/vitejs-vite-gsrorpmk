import { GoogleGenAI, Type } from "@google/genai";

const schema = {
  type: Type.OBJECT,
  properties: {
    customer_name: {
      type: Type.STRING,
      nullable: true,
    },
    contact_name: {
      type: Type.STRING,
      nullable: true,
    },
    contact_phone: {
      type: Type.STRING,
      nullable: true,
    },
    contact_email: {
      type: Type.STRING,
      nullable: true,
    },
    requirement: {
      type: Type.STRING,
      nullable: true,
    },
    expected_delivery_date: {
      type: Type.STRING,
      nullable: true,
    },
    delivery_location: {
      type: Type.STRING,
      nullable: true,
    },
    source: {
      type: Type.STRING,
      enum: [
        "WhatsApp",
        "Email",
        "Phone",
        "Website",
        "Referral",
        "Existing Customer",
        "Other",
      ],
    },
    status: {
      type: Type.STRING,
      enum: [
        "New",
        "Contacted",
        "Quotation Sent",
        "Negotiation",
        "Won",
        "Lost",
        "On Hold",
      ],
    },
    notes: {
      type: Type.STRING,
      nullable: true,
    },
    products: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          product_name: {
            type: Type.STRING,
          },
          description: {
            type: Type.STRING,
            nullable: true,
          },
          quantity: {
            type: Type.NUMBER,
            nullable: true,
          },
          unit: {
            type: Type.STRING,
            nullable: true,
          },
          budget_per_unit: {
            type: Type.NUMBER,
            nullable: true,
          },
          total_budget: {
            type: Type.NUMBER,
            nullable: true,
          },
          delivery_location: {
            type: Type.STRING,
            nullable: true,
          },
        },
        required: [
          "product_name",
          "description",
          "quantity",
          "unit",
          "budget_per_unit",
          "total_budget",
          "delivery_location",
        ],
      },
    },
  },
  required: [
    "customer_name",
    "contact_name",
    "contact_phone",
    "contact_email",
    "requirement",
    "expected_delivery_date",
    "delivery_location",
    "source",
    "status",
    "notes",
    "products",
  ],
};

const instructions = [
  "You are an expert sales inquiry data extraction assistant for Gifting Delight Private Limited.",
  "Extract information from the customer's inquiry accurately.",
  "",
  "IMPORTANT RULES:",
  "1. Do NOT invent information.",
  "2. If a field is not present, return null.",
  "3. Clearly distinguish the company/customer name from the contact person's name.",
  "4. Extract phone and email exactly when present.",
  "5. Extract every distinct product requested.",
  "6. One inquiry can contain multiple products.",
  "7. Never combine different products into one product.",
  "8. Extract quantity separately for each product.",
  "9. Extract budget separately for each product.",
  "10. Preserve important product specifications such as brand, colour, size, material, printing, logo and packaging.",
  "11. If several products have different quantities or budgets, keep them as separate product objects.",
  "12. Convert an explicitly stated delivery date to YYYY-MM-DD.",
  "13. Do not create an inquiry date. The application will set inquiry_date separately.",
  "14. If the inquiry is in Hindi, Hinglish, Marathi or mixed language, understand it and extract the information into the English field structure.",
  "15. The requirement field should be a concise overall summary, not the entire original message.",
  "16. The products array may contain any number of products.",
  "17. If the source is not explicitly stated, use Other.",
  "18. For a newly extracted inquiry, use status New.",
  "19. Never guess customer names, contact names, phone numbers, email addresses, quantities, prices or dates.",
  "20. If quantity is not stated, return null.",
  "21. If unit is not stated, return null.",
  "22. If budget is not stated, return null.",
  "23. If a number is given, do not assume it is a budget unless the inquiry clearly indicates that it is.",
  "24. If the customer says 500 T-shirts of Arrow for Rs 900 and Rs 900 clearly means per piece, use budget_per_unit 900.",
  "25. If the wording clearly gives a total budget rather than a per-unit budget, use total_budget.",
  "26. Extract the delivery city, full address, venue or delivery site into delivery_location when explicitly present; otherwise return null.",
  "27. Keep every distinct product as a separate object in products, even when products appear in the same sentence.",
  "28. Treat each product and delivery-location combination as a separate product object. If one product is split across three delivery locations, return three product objects with the quantity and delivery_location for each location.",
  "29. Never combine multiple delivery locations into one product object or one delivery_location string.",
].join("\n");

async function requestHandler(request, env) {
  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: "Method not allowed",
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: "Invalid JSON request body.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const text = typeof body?.text === "string" ? body.text : "";

    const imageBase64 =
      typeof body?.imageBase64 === "string" ? body.imageBase64 : null;

    const imageMimeType =
      typeof body?.imageMimeType === "string" ? body.imageMimeType : null;

    if (!text.trim() && !imageBase64) {
      return new Response(
        JSON.stringify({
          error: "No inquiry text or image supplied.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const apiKey = env?.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY is not configured on the server.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: 12000,
        },
      });

    const parts = [
      {
        text:
          instructions +
          "\n\nCustomer inquiry:\n" +
          (text.trim() || "(The inquiry was supplied as an image.)"),
      },
    ];

    if (imageBase64) {
      if (!imageMimeType) {
        return new Response(
          JSON.stringify({
            error: "imageMimeType is required when imageBase64 is supplied.",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64,
        },
      });
    }

    const models = [
        "gemini-2.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
      ];

    let response;
    let lastModelError;

    modelLoop: for (const model of models) {
        for (let attempt = 0; attempt < 1; attempt += 1) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts,
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: schema,
              temperature: 0,
            },
          });

          break modelLoop;
        } catch (modelError) {
          lastModelError = modelError;

          const details = String(
            modelError?.message || modelError,
          );

          const modelUnavailable =
            /404|NOT_FOUND|not found|model.+not.+available/i.test(
              details,
            );

          const temporarilyUnavailable =
            /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED|rate limit/i.test(
              details,
            );

          console.warn(
            `Gemini model ${model}, attempt ${attempt + 1} failed:`,
            details,
          );

          if (modelUnavailable) {
            break;
          }

          if (temporarilyUnavailable) {
            break;
          }

          throw modelError;
        }
      }
    }

    if (!response) {
      console.error(
        "All Gemini fallback models failed:",
        lastModelError,
      );

      throw new Error(
        "AI extraction is temporarily unavailable after trying all fallback models. Please try again shortly.",
      );
    }

    const outputText = response.text;

    if (!outputText) {
      throw new Error("Gemini returned an empty response.");
    }

    let extracted;

    try {
      extracted = JSON.parse(outputText);
    } catch {
      console.error(
        "Gemini returned invalid JSON:",
        outputText,
      );

      throw new Error("Gemini returned invalid JSON.");
    }

    if (!extracted.source) {
      extracted.source = "Other";
    }

    if (!extracted.status) {
      extracted.status = "New";
    }

    if (!Array.isArray(extracted.products)) {
      extracted.products = [];
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extracted,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error(
      "Gemini inquiry extraction error:",
      error,
    );

    return new Response(
      JSON.stringify({
        error:
          error?.message ||
          "Unable to extract inquiry.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/extract-inquiry") {
      return requestHandler(request, env);
    }

    return Response.json(
      {
        error: "Not found",
      },
      {
        status: 404,
      },
    );
  },
};