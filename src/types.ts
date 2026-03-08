export type WasteCategory = 'Recyclable' | 'Compostable' | 'Trash' | 'Special Handling';

export interface DropOffLocation {
  name: string;
  address: string;
  type: string;
  distance: string;
  mapsUrl: string;
}

export interface RecyclingCategory {
  title: string;
  impact: string;
  commonItems: string[];
  description: string;
  proTips: string[];
  iconId: string;
}

export interface LocalRules {
  city: string;
  county: string;
  blueBin: string[];
  greenBin: string[];
  blackBin: string[];
  specialRestrictions: string;
  collectionSchedule?: string;
}

export interface WasteAnalysis {
  itemType: string;
  category: WasteCategory;
  material: string;
  confidence: number;
  statusMessage: string;
  preparationTips: { text: string; status: 'done' | 'todo' | 'warning' }[];
  binType: string;
  localRule: string;
  ecoFact: string;
  sustainabilityTips: string;
  reasoning: string;
}

export interface UserLocation {
  zipCode: string;
  city: string;
  state: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export type PerformanceMode = 'High Performance' | 'Battery Saver';

export interface AppSettings {
  performanceMode: PerformanceMode;
  lowPowerMode: boolean;
  notifications: {
    pickup: boolean;
    rules: boolean;
    events: boolean;
  };
}

export interface SortingGuideItem {
  name: string;
  isAccepted: boolean;
  category: string;
  subCategory?: string;
  condition?: string;
  reasonIfNo?: string;
  nextStep?: string;
  source: string;
}

export interface SortingGuide {
  city: string;
  source: string;
  accepted: {
    plastics: SortingGuideItem[];
    paper: SortingGuideItem[];
    metals: SortingGuideItem[];
    glass: SortingGuideItem[];
    compost: SortingGuideItem[];
  };
  prohibited: SortingGuideItem[];
}
