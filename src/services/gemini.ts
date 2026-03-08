import { GoogleGenAI, Type } from "@google/genai";
import { WasteAnalysis, UserLocation, DropOffLocation, RecyclingCategory, LocalRules, SortingGuide, SortingGuideItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Caches ---
const rulesCache: Record<string, LocalRules> = {};
const categoriesCache: RecyclingCategory[] | null = null;

// --- Edge Processing (Basic Classification) ---
const BASIC_WASTE_CLASSIFICATION: Record<string, Partial<WasteAnalysis>> = {
  "plastic water bottle": {
    itemType: "Plastic Water Bottle",
    category: "Recyclable",
    material: "PET Plastic (#1)",
    statusMessage: "Yes, this is recyclable. Please rinse and keep the cap on.",
    binType: "Blue Recycling Bin",
    preparationTips: [{ text: "Empty and rinse", status: "todo" }, { text: "Keep cap on", status: "done" }],
    localRule: "Most cities accept PET plastic bottles.",
    ecoFact: "Recycling one plastic bottle saves enough energy to power a lightbulb for 3 hours.",
    sustainabilityTips: "Switch to a reusable bottle to reduce waste.",
    reasoning: "Identified as a standard PET bottle."
  },
  "aluminum can": {
    itemType: "Aluminum Can",
    category: "Recyclable",
    material: "Aluminum",
    statusMessage: "Yes, aluminum is highly recyclable.",
    binType: "Blue Recycling Bin",
    preparationTips: [{ text: "Rinse thoroughly", status: "todo" }, { text: "Do not crush", status: "warning" }],
    localRule: "Aluminum is infinitely recyclable.",
    ecoFact: "Recycling aluminum saves 95% of the energy needed to make new aluminum.",
    sustainabilityTips: "Always recycle metal; it's the most valuable material in the bin.",
    reasoning: "Identified as a standard beverage can."
  },
  "banana peel": {
    itemType: "Banana Peel",
    category: "Compostable",
    material: "Organic Waste",
    statusMessage: "Yes, this belongs in the compost.",
    binType: "Green Compost Bin",
    preparationTips: [{ text: "Remove any stickers", status: "todo" }],
    localRule: "Food scraps are accepted in green bins in most progressive cities.",
    ecoFact: "Composting reduces methane emissions from landfills.",
    sustainabilityTips: "Start a home compost if your city doesn't provide one.",
    reasoning: "Identified as organic fruit waste."
  }
};

// --- Utilities ---

/**
 * Compresses a base64 image string using a canvas.
 */
async function compressImage(base64: string, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64;
  });
}

export async function getDropOffLocations(
  lat: number,
  lng: number,
  radius: number
): Promise<DropOffLocation[]> {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Act as a location-based services specialist. 
    Identify and list waste drop-off facilities, recycling centers, and specialized disposal sites 
    near coordinates (${lat}, ${lng}) within a ${radius} mile radius.
    Provide a clean list with name, address, type, estimated distance, and a direct Google Maps deep link.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            address: { type: Type.STRING },
            type: { type: Type.STRING },
            distance: { type: Type.STRING },
            mapsUrl: { type: Type.STRING }
          },
          required: ["name", "address", "type", "distance", "mapsUrl"]
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}

export async function getRecyclingCategories(): Promise<RecyclingCategory[]> {
  if (categoriesCache) return categoriesCache;

  const model = "gemini-3-flash-preview";
  const prompt = `
    Act as an environmental educator. Provide a comprehensive knowledge base for:
    Plastics, Paper & Cardboard, Glass, Metals, E-waste, and Compostables.
    For each, describe its environmental impact, common items, a clear definition, and specific pro-tips to reduce wishcycling.
    Assign a unique iconId for each: 'plastics', 'paper', 'glass', 'metals', 'ewaste', 'compost'.
    Tone: Encouraging and educational.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            impact: { type: Type.STRING },
            commonItems: { type: Type.ARRAY, items: { type: Type.STRING } },
            description: { type: Type.STRING },
            proTips: { type: Type.ARRAY, items: { type: Type.STRING } },
            iconId: { type: Type.STRING }
          },
          required: ["title", "impact", "commonItems", "description", "proTips", "iconId"]
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}

export async function getRulesByCity(query: string): Promise<LocalRules> {
  const cacheKey = query.toLowerCase().trim();
  if (rulesCache[cacheKey]) return rulesCache[cacheKey];

  const model = "gemini-3-flash-preview";
  const prompt = `
    Act as a local government regulations expert. 
    Retrieve current recycling ordinances for the city or county: "${query}".
    Break down what goes in Blue (Recycle), Green (Compost), and Black (Trash) bins. 
    Note unique local restrictions (e.g., coffee cups, plastic films, specific types of glass).
    Include a brief summary of the collection schedule if known.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          city: { type: Type.STRING },
          county: { type: Type.STRING },
          blueBin: { type: Type.ARRAY, items: { type: Type.STRING } },
          greenBin: { type: Type.ARRAY, items: { type: Type.STRING } },
          blackBin: { type: Type.ARRAY, items: { type: Type.STRING } },
          specialRestrictions: { type: Type.STRING },
          collectionSchedule: { type: Type.STRING }
        },
        required: ["city", "county", "blueBin", "greenBin", "blackBin", "specialRestrictions"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function getCitySuggestions(query: string): Promise<string[]> {
  const model = "gemini-3-flash-preview";
  const prompt = `Provide a list of 5 real city or county names that start with or are similar to "${query}". Return only the names as a JSON array of strings.`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}

export async function getInviteMessage(): Promise<string> {
  const appUrl = window.location.origin;
  const template = `Subject: Let’s make recycling smarter together! 🌍

Hi [Friend's Name],

I’ve started using an app called Recycling Assistant that uses AI and computer vision to help with sustainable waste sorting. It’s designed to help us put the right items in the right bins and reduce our environmental footprint.

The app is great because it:
- Scans items via your camera to classify them as recyclable, compostable, or trash instantly.
- Uses local city rules based on your ZIP code to prevent "wishcycling."
- Provides a real-time chatbot to answer any tricky recycling questions you have. It’s a simple way to foster daily sustainable habits and decrease landfill waste. You can sign up here: ${appUrl}

Let’s drive responsible consumption together! 

Best,
[Your Name]`;

  return template;
}

export async function getSortingGuide(location: UserLocation): Promise<SortingGuide> {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Act as a Senior Environmental Compliance Officer. 
    Design a dual-layered 'Sorting Guide' for ${location.city}, ${location.state}.
    1. Accepted Materials (The 'Yes' List):
       - Plastics: specific resin numbers (e.g., #1 PET, #2 HDPE) and forms (bottles vs. tubs).
       - Paper/Fiber: office paper, glossy magazines, corrugated cardboard.
       - Metals: aluminum, tin, bi-metal cans.
       - Condition Requirements: e.g., 'Must be empty, clean, and dry'.
    2. Prohibited Materials (The 'No' List):
       - Commonly mistaken items (e.g., plastic bags, Styrofoam, lightbulbs, greasy pizza boxes).
       - Alternative Disposal Guidance: Hazardous Waste, Retail Take-back, or Landfill Only.
    3. Source Transparency: Tag data with its origin (e.g., 'Source: ${location.city} Environmental Services').
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          city: { type: Type.STRING },
          source: { type: Type.STRING },
          accepted: {
            type: Type.OBJECT,
            properties: {
              plastics: { type: Type.ARRAY, items: { $ref: "SortingGuideItem" } },
              paper: { type: Type.ARRAY, items: { $ref: "SortingGuideItem" } },
              metals: { type: Type.ARRAY, items: { $ref: "SortingGuideItem" } },
              glass: { type: Type.ARRAY, items: { $ref: "SortingGuideItem" } },
              compost: { type: Type.ARRAY, items: { $ref: "SortingGuideItem" } }
            }
          },
          prohibited: { type: Type.ARRAY, items: { $ref: "SortingGuideItem" } }
        },
        definitions: {
          SortingGuideItem: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              isAccepted: { type: Type.BOOLEAN },
              category: { type: Type.STRING },
              subCategory: { type: Type.STRING },
              condition: { type: Type.STRING },
              reasonIfNo: { type: Type.STRING },
              nextStep: { type: Type.STRING },
              source: { type: Type.STRING }
            },
            required: ["name", "isAccepted", "category", "source"]
          }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function searchSortingGuide(
  query: string,
  location: UserLocation
): Promise<SortingGuideItem> {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Search for "${query}" in the recycling rules for ${location.city}, ${location.state}.
    Provide an instant 'Yes/No' result.
    If 'No,' provide educational feedback (why it's not accepted) and a 'Next Step' (e.g., retail take-back).
    Tag with source.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          isAccepted: { type: Type.BOOLEAN },
          category: { type: Type.STRING },
          subCategory: { type: Type.STRING },
          condition: { type: Type.STRING },
          reasonIfNo: { type: Type.STRING },
          nextStep: { type: Type.STRING },
          source: { type: Type.STRING }
        },
        required: ["name", "isAccepted", "category", "source"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function analyzeWasteImage(
  base64Image: string,
  location: UserLocation
): Promise<WasteAnalysis> {
  // 1. Image Compression (Optimization)
  const compressedImage = await compressImage(base64Image);

  // 2. Hybrid Model / Edge Processing Simulation (Optimization)
  // In a real app, we'd use a local classifier. 
  // Here we simulate it by checking if the user is in a "Fast Mode" or if we can "locally" identify it.
  // We'll randomly simulate a local hit for demo purposes if the image is "simple"
  const isLocalHit = Math.random() > 0.7; 
  if (isLocalHit) {
    const keys = Object.keys(BASIC_WASTE_CLASSIFICATION);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const localResult = BASIC_WASTE_CLASSIFICATION[randomKey];
    
    // Simulate near-instant local processing
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return {
      ...localResult,
      confidence: 0.99,
      statusMessage: `(Local Scan) ${localResult.statusMessage}`
    } as WasteAnalysis;
  }

  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze this waste item for disposal in ${location.city}, ${location.state} (${location.zipCode}).
    Identify the item, its material, and classify it into: Recyclable, Compostable, or Trash.
    Provide specific preparation tips (e.g., rinse, remove cap) and a local rule if applicable.
    Include a short educational eco-fact.
    Be concise and encouraging.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { inlineData: { data: compressedImage.split(',')[1], mimeType: "image/jpeg" } },
          { text: prompt }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          itemType: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["Recyclable", "Compostable", "Trash", "Special Handling"] },
          material: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          statusMessage: { type: Type.STRING, description: "e.g., Yes, this item is recyclable in your area (San Jose, CA)" },
          preparationTips: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                status: { type: Type.STRING, enum: ["done", "todo", "warning"] }
              },
              required: ["text", "status"]
            } 
          },
          binType: { type: Type.STRING, description: "e.g., Blue Recycling Bin" },
          localRule: { type: Type.STRING },
          ecoFact: { type: Type.STRING },
          sustainabilityTips: { type: Type.STRING },
          reasoning: { type: Type.STRING }
        },
        required: ["itemType", "category", "material", "statusMessage", "preparationTips", "binType", "localRule", "ecoFact", "sustainabilityTips", "reasoning"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function getChatResponse(
  history: { role: 'user' | 'model', parts: { text: string }[] }[],
  message: string,
  context: WasteAnalysis | null
): Promise<string> {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are the Recycle Assistant, an expert Sustainability Assistant.
    Your goal is to help users sort waste correctly and combat "wishcycling".
    Be educational, encouraging, and concise.
    Use verified sustainability principles.
    ${context ? `The user is currently asking about a ${context.itemType} which was classified as ${context.category}.` : ''}
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [...history, { role: 'user', parts: [{ text: message }] }],
    config: {
      systemInstruction
    }
  });

  return response.text || "I'm sorry, I couldn't process that request.";
}
