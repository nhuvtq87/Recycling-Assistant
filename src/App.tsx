import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  ArrowLeft, 
  Send, 
  MapPin, 
  User, 
  BookOpen, 
  Settings,
  ChevronRight,
  History,
  Trash2,
  Recycle,
  Leaf,
  MessageCircle,
  Scan,
  Package,
  FileText,
  GlassWater,
  Hammer,
  Cpu,
  Zap,
  Search
} from 'lucide-react';
import { analyzeWasteImage, getChatResponse, getDropOffLocations, getRecyclingCategories, getRulesByCity, getCitySuggestions, getInviteMessage, getSortingGuide, searchSortingGuide } from './services/gemini';
import { WasteAnalysis, UserLocation, ChatMessage, WasteCategory, DropOffLocation, RecyclingCategory, LocalRules, AppSettings, PerformanceMode, SortingGuide, SortingGuideItem } from './types';
import { cn } from './lib/utils';
import Markdown from 'react-markdown';

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  className, 
  variant = 'primary',
  disabled = false,
  isLoading = false
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  isLoading?: boolean;
}) => {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    secondary: 'bg-stone-800 text-white hover:bg-stone-900',
    outline: 'border border-stone-200 text-stone-700 hover:bg-stone-50',
    ghost: 'text-stone-600 hover:bg-stone-100',
    danger: 'bg-red-500 text-white hover:bg-red-600'
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        'px-6 py-3 rounded-2xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : children}
    </button>
  );
};

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div onClick={onClick} className={cn('bg-white rounded-3xl p-6 shadow-sm border border-stone-100', className)}>
    {children}
  </div>
);

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('bg-stone-200 animate-pulse rounded-xl', className)} />
);

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'splash' | 'auth' | 'login' | 'home' | 'camera' | 'result' | 'chat' | 'dropoff' | 'invite' | 'categories' | 'rules' | 'settings' | 'profile' | 'notifications' | 'help' | 'sorting-guide'>('splash');
  const [userLocation, setUserLocation] = useState<UserLocation>({ zipCode: '94103', city: 'San Francisco', state: 'CA' });
  const [userInfo, setUserInfo] = useState({
    name: 'John Doe',
    email: 'nhuvtq87@gmail.com',
  });
  const [notifSettings, setNotifSettings] = useState({
    pickup: true,
    rules: true,
    events: false
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [analysis, setAnalysis] = useState<WasteAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [showChatFab, setShowChatFab] = useState(true);

  // App Settings (Optimization)
  const [settings, setSettings] = useState<AppSettings>({
    performanceMode: 'High Performance',
    lowPowerMode: false,
    notifications: {
      pickup: true,
      rules: true,
      events: false
    }
  });

  // Feature states
  const [dropOffs, setDropOffs] = useState<DropOffLocation[]>([]);
  const [radius, setRadius] = useState<number>(5);
  const [isLoadingDropOffs, setIsLoadingDropOffs] = useState(false);
  
  const [inviteMsg, setInviteMsg] = useState('');
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);

  const [categories, setCategories] = useState<RecyclingCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const [localRules, setLocalRules] = useState<LocalRules | null>(null);
  const [isLoadingRules, setIsLoadingRules] = useState(false);

  const [sortingGuide, setSortingGuide] = useState<SortingGuide | null>(null);
  const [isLoadingSortingGuide, setIsLoadingSortingGuide] = useState(false);
  const [sortingSearchQuery, setSortingSearchQuery] = useState('');
  const [sortingSearchResult, setSortingSearchResult] = useState<SortingGuideItem | null>(null);
  const [isSearchingSorting, setIsSearchingSorting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Passive Geofencing: Throttled location updates (Optimization)
    let lastUpdate = 0;
    const THRESHOLD = 30000; // 30 seconds

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition((pos) => {
        const now = Date.now();
        if (now - lastUpdate > THRESHOLD) {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          lastUpdate = now;
        }
      });
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  useEffect(() => {
    // Power-on-Demand: Only start camera when in camera view (Optimization)
    if (view === 'camera') {
      startCamera();
    } else {
      stopCamera();
      // System Resource Cleanup: Clear temp data when leaving scan module (Optimization)
      if (view !== 'result' && view !== 'chat') {
        setAnalysis(null);
        setCapturedImage(null);
      }
    }
  }, [view]);

  useEffect(() => {
    if (userLocation.city) {
      fetchRules();
    }
  }, [userLocation.city]);

  // --- Handlers ---

  const fetchDropOffs = async (r: number) => {
    if (!coords) return;
    // Intelligent Polling: Skip if already loaded for this radius (Optimization)
    if (dropOffs.length > 0 && radius === r && !settings.lowPowerMode) return;
    
    setIsLoadingDropOffs(true);
    setRadius(r);
    try {
      const data = await getDropOffLocations(coords.lat, coords.lng, r);
      setDropOffs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDropOffs(false);
    }
  };

  const fetchInvite = async () => {
    setIsLoadingInvite(true);
    try {
      const data = await getInviteMessage();
      setInviteMsg(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingInvite(false);
    }
  };

  const fetchCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const data = await getRecyclingCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const fetchRules = async (cityQuery?: string) => {
    const query = cityQuery || userLocation.city;
    if (!query) return;
    setIsLoadingRules(true);
    try {
      const data = await getRulesByCity(query);
      setLocalRules(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingRules(false);
    }
  };

  const fetchSortingGuide = async () => {
    setIsLoadingSortingGuide(true);
    try {
      const data = await getSortingGuide(userLocation);
      setSortingGuide(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSortingGuide(false);
    }
  };

  const handleSearchSorting = async (query: string) => {
    if (!query.trim()) return;
    setIsSearchingSorting(true);
    setSortingSearchResult(null);
    try {
      const result = await searchSortingGuide(query, userLocation);
      setSortingSearchResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingSorting(false);
    }
  };

  const [cameraError, setCameraError] = useState<string | null>(null);

  // --- Handlers ---

  const startCamera = async () => {
    setCameraError(null);
    try {
      // Frame Rate Throttling: Lower FPS in Battery Saver mode (Optimization)
      const frameRate = settings.performanceMode === 'Battery Saver' ? 15 : 30;
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          frameRate: { ideal: frameRate }
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setCameraError(err.name === 'NotAllowedError' ? 'Permission denied' : 'Could not access camera');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current && !cameraError) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
        handleAnalyze(dataUrl);
      }
    }
  };

  const handleAnalyze = async (image: string) => {
    setIsAnalyzing(true);
    setView('result');
    try {
      const result = await analyzeWasteImage(image, userLocation);
      setAnalysis(result);
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    const newUserMsg: ChatMessage = { role: 'user', text };
    setChatHistory(prev => [...prev, newUserMsg]);
    setIsChatting(true);

    try {
      const history = chatHistory.map(m => ({ 
        role: m.role, 
        parts: [{ text: m.text }] 
      }));
      const response = await getChatResponse(history, text, analysis);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      console.error("Chat failed:", err);
    } finally {
      setIsChatting(false);
    }
  };

  // --- Views ---

  const SplashView = () => (
    <div className="h-full flex flex-col items-center justify-center p-8 bg-[#f5f5f0] text-stone-900">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center gap-8"
      >
        <div className="w-32 h-32 bg-emerald-100 rounded-full flex items-center justify-center">
          <Recycle className="w-16 h-16 text-emerald-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-serif font-bold tracking-tight">Recycle Assistant</h1>
          <p className="text-stone-500 font-medium italic">Know Before You Throw.</p>
        </div>
        <div className="w-full space-y-4">
          <Button onClick={() => setView('auth')} className="w-full">Get Started</Button>
        </div>
      </motion.div>
    </div>
  );

  const AuthView = () => (
    <div className="h-full flex flex-col p-8 bg-emerald-900 text-white">
      <div className="flex-1 flex flex-col justify-center gap-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-serif font-bold">Create Account</h2>
          <p className="text-emerald-200/70">Join the sustainability movement.</p>
        </div>
        <div className="space-y-4">
          <input type="text" placeholder="Full Name" className="w-full bg-emerald-800/50 border border-emerald-700 rounded-2xl p-4 placeholder:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input type="email" placeholder="Email" className="w-full bg-emerald-800/50 border border-emerald-700 rounded-2xl p-4 placeholder:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input type="password" placeholder="Password" className="w-full bg-emerald-800/50 border border-emerald-700 rounded-2xl p-4 placeholder:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <div className="flex gap-4">
            <input type="text" placeholder="City" className="flex-1 bg-emerald-800/50 border border-emerald-700 rounded-2xl p-4 placeholder:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="text" placeholder="Zip" className="w-24 bg-emerald-800/50 border border-emerald-700 rounded-2xl p-4 placeholder:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
        <Button onClick={() => setView('home')} className="bg-white text-emerald-900 hover:bg-emerald-50">Sign Up</Button>
      </div>
      <p className="text-center text-sm text-emerald-400">Already registered? <span onClick={() => setView('login')} className="text-white font-bold cursor-pointer">Login here</span></p>
    </div>
  );

  const LoginView = () => (
    <div className="h-full flex flex-col p-8 bg-emerald-900 text-white">
      <div className="flex-1 flex flex-col justify-center gap-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-serif font-bold">Welcome Back</h2>
          <p className="text-emerald-200/70">Sign in to continue your impact.</p>
        </div>
        
        <div className="space-y-4">
          <input type="email" placeholder="Email" className="w-full bg-emerald-800/50 border border-emerald-700 rounded-2xl p-4 placeholder:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input type="password" placeholder="Password" className="w-full bg-emerald-800/50 border border-emerald-700 rounded-2xl p-4 placeholder:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <div className="text-right">
            <span className="text-xs text-emerald-400 font-medium cursor-pointer">Forgot Password?</span>
          </div>
        </div>

        <Button onClick={() => setView('home')} className="bg-white text-emerald-900 hover:bg-emerald-50">Login</Button>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-emerald-700"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-emerald-900 px-2 text-emerald-400">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <button onClick={() => setView('home')} className="flex items-center justify-center p-4 bg-emerald-800/50 border border-emerald-700 rounded-2xl hover:bg-emerald-800 transition-colors">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </button>
          <button onClick={() => setView('home')} className="flex items-center justify-center p-4 bg-emerald-800/50 border border-emerald-700 rounded-2xl hover:bg-emerald-800 transition-colors">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </button>
          <button onClick={() => setView('home')} className="flex items-center justify-center p-4 bg-emerald-800/50 border border-emerald-700 rounded-2xl hover:bg-emerald-800 transition-colors">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M17.05 20.28c-.98.95-2.05 1.61-3.22 1.61-1.16 0-1.54-.71-2.83-.71-1.29 0-1.72.71-2.83.71-1.11 0-2.12-.66-3.11-1.61C3.04 18.33 1.5 15.03 1.5 12.09c0-4.74 3.08-7.25 6.1-7.25 1.58 0 2.97.98 3.86.98.89 0 2.45-1.18 4.31-1.18 1.58 0 3.02.82 3.96 2.05-3.2 1.92-2.68 6.06.52 7.36-.82 2.12-1.85 4.15-3.2 6.23zM12.03 4.81c-.15-2.11 1.61-3.95 3.51-4.06.27 2.31-2.02 4.35-3.51 4.06z" />
            </svg>
          </button>
        </div>
      </div>
      <p className="text-center text-sm text-emerald-400">New here? <span onClick={() => setView('auth')} className="text-white font-bold cursor-pointer">Create account</span></p>
    </div>
  );

  const HomeView = () => (
    <div className="h-full flex flex-col bg-[#f8f9fa]">
      {/* Header */}
      <div className="p-6 pb-2 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Current Location</p>
          <div className="flex items-center gap-1.5 text-stone-900">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold">{userLocation.city}, {userLocation.state}</span>
          </div>
        </div>
        <button onClick={() => setView('profile')} className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-600 active:scale-90 transition-transform">
          <User className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6 overflow-y-auto flex-1 pb-24">
        {/* Hero Section */}
        <Card className="bg-emerald-600 text-white border-none p-8 relative overflow-hidden shadow-xl shadow-emerald-200/50">
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full">
              <Leaf className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Eco-Friendly</span>
            </div>
            <h3 className="text-3xl font-serif font-bold leading-tight">Make Every Sort Count</h3>
            <p className="text-emerald-100 text-sm leading-relaxed opacity-90">Use AI to instantly identify recyclables and reduce landfill waste in your community.</p>
            <Button onClick={startCamera} className="bg-white text-emerald-600 hover:bg-emerald-50 px-6 py-3 rounded-2xl font-bold shadow-lg">
              <Scan className="w-5 h-5" />
              Scan Now
            </Button>
          </div>
          <div className="absolute -right-8 -bottom-8 opacity-10">
            <Recycle className="w-48 h-48" />
          </div>
        </Card>

        {/* Local Rules Quick Look */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Local Rules: {userLocation.city}</h4>
            <button onClick={() => { setView('rules'); fetchRules(); }} className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">View All</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl text-center space-y-1">
              <div className="w-8 h-8 bg-blue-600 rounded-lg mx-auto flex items-center justify-center text-white">
                <Recycle className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-bold text-blue-800 uppercase">Recycle</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center space-y-1">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg mx-auto flex items-center justify-center text-white">
                <Leaf className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-bold text-emerald-800 uppercase">Compost</p>
            </div>
            <div className="bg-stone-100 border border-stone-200 p-3 rounded-2xl text-center space-y-1">
              <div className="w-8 h-8 bg-stone-800 rounded-lg mx-auto flex items-center justify-center text-white">
                <Trash2 className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-bold text-stone-800 uppercase">Trash</p>
            </div>
          </div>
        </div>

        {/* Main Actions Grid */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: MapPin, label: 'Drop-Off Finder', color: 'bg-white text-emerald-600', onClick: () => { setView('dropoff'); fetchDropOffs(5); } },
            { icon: BookOpen, label: 'Categories Hub', color: 'bg-white text-emerald-600', onClick: () => { setView('categories'); fetchCategories(); } },
            { icon: FileText, label: 'Confusing Item?', color: 'bg-white text-emerald-600', onClick: () => { setView('sorting-guide'); fetchSortingGuide(); } },
            { icon: User, label: 'Invite Friends', color: 'bg-white text-emerald-600', onClick: () => { setView('invite'); fetchInvite(); } },
          ].map((item, i) => (
            <Card key={i} onClick={item.onClick} className="flex flex-col items-start gap-4 p-5 hover:shadow-md transition-all active:scale-[0.98] cursor-pointer group">
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border border-stone-100 group-hover:bg-emerald-50 transition-colors', item.color)}>
                <item.icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-stone-700">{item.label}</span>
            </Card>
          ))}
        </div>
      </div>

      {/* Floating Action Button for Chat */}
      <AnimatePresence>
        {showChatFab && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setView('chat')}
            className="fixed bottom-24 right-6 w-14 h-14 bg-stone-900 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition-transform"
          >
            <MessageCircle className="w-7 h-7" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <div className="bg-white/80 backdrop-blur-lg border-t border-stone-100 p-4 pb-8 flex justify-around items-center absolute bottom-0 w-full z-30">
        <button className="flex flex-col items-center gap-1 text-emerald-600">
          <BookOpen className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Home</span>
        </button>
        <button onClick={() => { setView('dropoff'); fetchDropOffs(5); }} className="flex flex-col items-center gap-1 text-stone-400">
          <MapPin className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Finder</span>
        </button>
        <button onClick={startCamera} className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white -mt-12 shadow-xl shadow-emerald-200 border-4 border-white active:scale-90 transition-transform">
          <Scan className="w-8 h-8" />
        </button>
        <button onClick={() => { setView('categories'); fetchCategories(); }} className="flex flex-col items-center gap-1 text-stone-400">
          <Recycle className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Learn</span>
        </button>
        <button onClick={() => setView('settings')} className="flex flex-col items-center gap-1 text-stone-400">
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Settings</span>
        </button>
      </div>
    </div>
  );

  const CameraView = () => (
    <div className="h-full bg-black relative overflow-hidden">
      {!cameraError ? (
        <div className="relative h-full">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
          {/* Real-time Overlay Simulation */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="scan-line" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-white/30 rounded-3xl">
              <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
              
              <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
                AI SCANNER ACTIVE
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center gap-6 bg-stone-900">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-red-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Camera Access Required</h3>
            <p className="text-stone-400 text-sm leading-relaxed">
              To scan items, we need permission to use your camera. Please check your browser settings and try again.
            </p>
          </div>
          <Button onClick={startCamera} className="w-full">Retry Permission</Button>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none">
        <div className="flex justify-between items-center pointer-events-auto">
          <button onClick={() => { stopCamera(); setView('home'); }} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform">
            <ArrowLeft className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-white rounded-[40px] p-8 space-y-6 shadow-2xl pointer-events-auto translate-y-4">
          <div className="space-y-2">
            <h3 className="font-bold text-2xl text-stone-900">Scan Item</h3>
            <p className="text-stone-500 text-sm leading-relaxed">Position the item within the frame. Our AI will identify the material and sorting rules instantly.</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={captureImage} disabled={!!cameraError} className="flex-1 py-4 rounded-2xl font-bold text-lg">
              Capture
            </Button>
            <button onClick={() => { stopCamera(); setView('home'); }} className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-600 active:scale-90 transition-transform">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const ResultView = () => {
    const categoryColors: Record<WasteCategory, string> = {
      'Recyclable': 'text-emerald-600 bg-emerald-50',
      'Compostable': 'text-teal-600 bg-teal-50',
      'Trash': 'text-red-600 bg-red-50',
      'Special Handling': 'text-orange-600 bg-orange-50'
    };

    const categoryIcons: Record<WasteCategory, any> = {
      'Recyclable': Recycle,
      'Compostable': Leaf,
      'Trash': Trash2,
      'Special Handling': AlertCircle
    };

    const Icon = analysis ? categoryIcons[analysis.category] : Recycle;

    return (
      <div className="h-full flex flex-col bg-white">
        <div className="p-4 flex items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
          <button onClick={() => setView('home')} className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isAnalyzing ? (
        <div className="h-full flex flex-col p-6 gap-8">
          <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden">
            <Skeleton className="w-full h-full" />
          </div>
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="w-48 h-8" />
              <Skeleton className="w-32 h-6 rounded-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="w-full h-24" />
              <Skeleton className="w-full h-12" />
              <Skeleton className="w-full h-32" />
            </div>
          </div>
          <div className="mt-auto space-y-2 text-center">
            <p className="text-xs font-bold text-emerald-600 animate-pulse">AI IDENTIFICATION IN PROGRESS...</p>
            <p className="text-[10px] text-stone-400">Optimizing image for cloud transmission</p>
          </div>
        </div>
      ) : analysis ? (
            <div className="space-y-0">
              {capturedImage && (
                <div className="w-full aspect-[4/3] overflow-hidden bg-stone-100">
                  <img src={capturedImage} alt="Captured waste" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="p-6 space-y-8 -mt-6 bg-white rounded-t-[40px] relative z-10 shadow-[0_-20px_40px_rgba(0,0,0,0.05)]">
                <div className="text-center space-y-3">
                  <h3 className="text-2xl font-bold text-stone-900">{analysis.itemType}</h3>
                  <div className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold',
                    analysis.category === 'Recyclable' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'
                  )}>
                    {analysis.category === 'Recyclable' ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    {analysis.statusMessage}
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Preparation Tips */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> PREPARATION TIPS
                    </h4>
                    <ul className="space-y-3">
                      {analysis.preparationTips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm font-medium text-stone-700">
                          {tip.status === 'done' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          ) : tip.status === 'warning' ? (
                            <X className="w-5 h-5 text-red-500 flex-shrink-0" />
                          ) : (
                            <div className="w-5 h-5 border-2 border-stone-200 rounded-full flex-shrink-0" />
                          )}
                          {tip.text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Bin Info */}
                  <div className="flex items-center gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                    <Trash2 className="w-6 h-6 text-stone-400" />
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">PLACE IN</p>
                      <p className="text-sm font-bold text-stone-700">{analysis.binType}</p>
                    </div>
                  </div>

                  {/* Local Rule */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" /> LOCAL RULE
                    </h4>
                    <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 p-4 rounded-2xl border border-stone-100 italic">
                      {analysis.localRule}
                    </p>
                  </div>

                  {/* Sustainability Tips */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2">
                      <Leaf className="w-4 h-4" /> SUSTAINABILITY TIPS
                    </h4>
                    <p className="text-sm text-stone-600 leading-relaxed">
                      {analysis.sustainabilityTips}
                    </p>
                  </div>

                  {/* Eco Fact */}
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-2">
                    <div className="flex items-center gap-2 text-amber-600">
                      <Info className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-widest">ECO FACT</span>
                    </div>
                    <p className="text-sm text-amber-800 italic font-medium">
                      {analysis.ecoFact}
                    </p>
                  </div>

                  {/* Report Misclassification */}
                  <button 
                    onClick={() => {
                      alert("Thank you for your feedback! Our team will review this classification to improve our AI accuracy.");
                    }}
                    className="w-full py-4 flex items-center justify-center gap-2 text-stone-400 hover:text-stone-600 transition-colors border-t border-stone-100 pt-6"
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">Report Misclassification</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
              <p>Something went wrong with the analysis. Please try again.</p>
              <Button onClick={() => setView('camera')}>Try Again</Button>
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-stone-100 flex gap-3 sticky bottom-0 z-20">
          <Button variant="outline" onClick={() => setView('home')} className="flex-1 rounded-xl">Done</Button>
          <Button onClick={() => setView('chat')} className="flex-1 gap-2 rounded-xl">
            <MessageCircle className="w-5 h-5" /> Ask Assistant
          </Button>
        </div>

        {/* Bottom Nav */}
        <div className="bg-white border-t border-stone-100 p-4 flex justify-around items-center">
          <button onClick={() => setView('home')} className="flex flex-col items-center gap-1 text-stone-400">
            <BookOpen className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-stone-400">
            <MapPin className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Location</span>
          </button>
          <button onClick={startCamera} className="flex flex-col items-center gap-1 text-emerald-600">
            <Recycle className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Scan & Sort</span>
          </button>

          <button className="flex flex-col items-center gap-1 text-stone-400">
            <User className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Profile</span>
          </button>
        </div>
      </div>
    );
  };

  const ChatView = () => {
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [chatHistory]);

    return (
      <div className="h-full flex flex-col bg-[#f5f5f0]">
        <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
          <button onClick={() => setView('result')} className="p-2 hover:bg-stone-100 rounded-full">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h2 className="font-bold">Sustainability Assistant</h2>
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Online</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {chatHistory.length === 0 && (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <MessageCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-stone-500 text-sm">Ask me anything about recycling, composting, or how to reduce your waste footprint!</p>
            </div>
          )}
          {chatHistory.map((msg, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'max-w-[85%] p-4 rounded-3xl text-sm',
                msg.role === 'user' 
                  ? 'bg-emerald-600 text-white ml-auto rounded-tr-none' 
                  : 'bg-white text-stone-800 mr-auto rounded-tl-none shadow-sm border border-stone-100'
              )}
            >
              <div className="markdown-body">
                <Markdown>{msg.text}</Markdown>
              </div>
            </motion.div>
          ))}
          {isChatting && (
            <div className="bg-white text-stone-800 mr-auto rounded-3xl rounded-tl-none shadow-sm border border-stone-100 p-4 flex gap-1">
              <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-stone-100 flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && input.trim()) {
                handleSendMessage(input);
                setInput('');
              }
            }}
            placeholder="Type your question..." 
            className="flex-1 bg-stone-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button 
            onClick={() => { handleSendMessage(input); setInput(''); }}
            disabled={!input.trim() || isChatting}
            className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  const DropOffView = () => (
    <div className="h-full flex flex-col bg-[#f5f5f0]">
      <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
        <button onClick={() => setView('home')} className="p-2 hover:bg-stone-100 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="font-bold">Drop-Off Locations</h2>
      </div>
      <div className="p-4 flex gap-2 bg-white border-b border-stone-100 overflow-x-auto">
        {[5, 10, 20, 25].map(r => (
          <button 
            key={r} 
            onClick={() => fetchDropOffs(r)}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold transition-colors",
              radius === r ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600"
            )}
          >
            {r} miles
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingDropOffs ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : dropOffs.map((loc, i) => (
          <Card key={i} className="space-y-3">
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-stone-900">{loc.name}</h3>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{loc.distance}</span>
            </div>
            <p className="text-sm text-stone-500">{loc.address}</p>
            <div className="flex justify-between items-center pt-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{loc.type}</span>
              <a href={loc.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 text-sm font-bold flex items-center gap-1">
                Navigate <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const InviteView = () => {
    const [email, setEmail] = useState('');
    const [note, setNote] = useState('This is such an amazing app - would love for you to try this out as well!');
    const [isSending, setIsSending] = useState(false);

    const handleSend = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email) return;
      
      setIsSending(true);
      // Simulate sending
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsSending(false);
      
      alert("Invite Sent!");
      setView('home');
    };

    return (
      <div className="h-full flex flex-col bg-[#fdfcf7]">
        <div className="p-4 flex items-center gap-4 bg-transparent">
          <button onClick={() => setView('home')} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-stone-600" />
          </button>
          <h2 className="font-bold text-stone-800 tracking-tight uppercase text-sm">Invite Friends</h2>
        </div>

        <div className="flex-1 p-8 max-w-md mx-auto w-full space-y-8">
          <div className="space-y-1">
            <h1 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">Spread the Word</h1>
            <p className="text-stone-500 text-sm">Help your friends join the sustainability movement.</p>
          </div>

          <form onSubmit={handleSend} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                Your friend's e-mail address *
              </label>
              <input
                required
                type="email"
                placeholder="janedoe@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a365d] transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                Add a note to this invitation (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="This is such an amazing app - would love for you to try this out as well!"
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-[#1a365d] transition-all resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="bg-[#1a365d] text-white px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-900/20 hover:bg-[#142a4a] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invitation"
              )}
            </button>
          </form>
        </div>
      </div>
    );
  };

  const [selectedCategory, setSelectedCategory] = useState<RecyclingCategory | null>(null);

  const CategoriesView = () => {
    const getIcon = (iconId: string) => {
      switch (iconId) {
        case 'plastics': return <Package className="w-8 h-8" />;
        case 'paper': return <FileText className="w-8 h-8" />;
        case 'glass': return <GlassWater className="w-8 h-8" />;
        case 'metals': return <Hammer className="w-8 h-8" />;
        case 'ewaste': return <Cpu className="w-8 h-8" />;
        case 'compost': return <Leaf className="w-8 h-8" />;
        default: return <Info className="w-8 h-8" />;
      }
    };

    if (selectedCategory) {
      const isAccepted = (title: string) => {
        if (!localRules) return true;
        const lowerTitle = title.toLowerCase();
        const allRules = [...localRules.blueBin, ...localRules.greenBin, ...localRules.blackBin].join(' ').toLowerCase();
        
        // Simple heuristic: if the category name or common items are mentioned in the bins
        if (allRules.includes(lowerTitle)) return true;
        if (selectedCategory.commonItems.some(item => allRules.includes(item.toLowerCase()))) return true;
        
        return false;
      };

      const accepted = isAccepted(selectedCategory.title);

      return (
        <div className="h-full flex flex-col bg-[#f8f9fa]">
          <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
            <button onClick={() => setSelectedCategory(null)} className="p-2 hover:bg-stone-100 rounded-full active:scale-90 transition-transform">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h2 className="font-bold">{selectedCategory.title}</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                {getIcon(selectedCategory.iconId)}
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-2xl font-serif font-bold text-stone-900">{selectedCategory.title}</h3>
                {!accepted && (
                  <div className="flex items-center justify-center gap-1.5 text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Not accepted in {userLocation.city}</span>
                  </div>
                )}
              </div>
            </div>

            <section className="space-y-4">
              <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Educational Content</h4>
              <Card className="p-6 bg-emerald-50 border-emerald-100">
                <p className="text-sm text-emerald-900 leading-relaxed italic">
                  {selectedCategory.impact}
                </p>
                <div className="mt-4 pt-4 border-t border-emerald-200/50">
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    {selectedCategory.description}
                  </p>
                </div>
              </Card>
            </section>

            <section className="space-y-4">
              <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Accepted Items</h4>
              <div className="grid grid-cols-2 gap-3">
                {selectedCategory.commonItems.map((item, i) => (
                  <div key={i} className="bg-white p-4 rounded-2xl border border-stone-100 flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                    <span className="text-sm font-medium text-stone-700">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Pro Tips</h4>
              <div className="space-y-3">
                {selectedCategory.proTips.map((tip, i) => (
                  <div key={i} className="flex gap-4 p-4 bg-white rounded-2xl border border-stone-100">
                    <div className="w-8 h-8 bg-amber-100 rounded-full flex-shrink-0 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-amber-600" />
                    </div>
                    <p className="text-sm text-stone-600 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col bg-[#f8f9fa]">
        <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
          <button onClick={() => setView('home')} className="p-2 hover:bg-stone-100 rounded-full active:scale-90 transition-transform">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold">Waste Categories</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="space-y-2">
            <h3 className="text-2xl font-serif font-bold text-stone-900">Sorting Guide</h3>
            <p className="text-sm text-stone-500 leading-relaxed">Select a category to learn how to sort it correctly and reduce environmental impact.</p>
          </div>
          
          {isLoadingCategories ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {categories.map((cat, i) => (
                <button 
                  key={i} 
                  onClick={() => setSelectedCategory(cat)}
                  className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex flex-col items-center gap-4 active:scale-95"
                >
                  <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                    {getIcon(cat.iconId)}
                  </div>
                  <span className="text-sm font-bold text-stone-800">{cat.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const SettingsView = () => (
    <div className="h-full flex flex-col bg-[#f8f9fa]">
      <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
        <button onClick={() => setView('home')} className="p-2 hover:bg-stone-100 rounded-full active:scale-90 transition-transform">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="font-bold">Settings & Ethics</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <section className="space-y-4">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Performance & Battery</h3>
          <Card className="p-0 overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-stone-100">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-stone-800">Performance Mode</p>
                <p className="text-xs text-stone-500">Balance speed and battery life.</p>
              </div>
              <select 
                value={settings.performanceMode}
                onChange={(e) => setSettings(prev => ({ ...prev, performanceMode: e.target.value as PerformanceMode }))}
                className="bg-stone-100 text-xs font-bold p-2 rounded-lg focus:outline-none"
              >
                <option value="High Performance">High Speed</option>
                <option value="Battery Saver">Battery Saver</option>
              </select>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-stone-800">Low Power Mode</p>
                <p className="text-xs text-stone-500">Freeze background tasks.</p>
              </div>
              <button 
                onClick={() => setSettings(prev => ({ ...prev, lowPowerMode: !prev.lowPowerMode }))}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  settings.lowPowerMode ? "bg-emerald-600" : "bg-stone-200"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  settings.lowPowerMode ? "left-7" : "left-1"
                )} />
              </button>
            </div>
          </Card>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">AI Transparency</h3>
          <Card className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-bold text-stone-800">How decisions are made</h4>
              <p className="text-sm text-stone-600 leading-relaxed">
                Our AI uses computer vision to identify materials and cross-references them with local municipal rules. It prioritizes the most restrictive local ordinances to prevent contamination.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-stone-800">Privacy First</h4>
              <p className="text-sm text-stone-600 leading-relaxed">
                We do not use face-tracking or store personally identifiable images. All image analysis is performed on the waste item only.
              </p>
            </div>
            <Button variant="outline" onClick={() => setView('help')} className="w-full text-xs py-2">Learn More in Help Center</Button>
          </Card>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Account</h3>
          <Card className="p-0 overflow-hidden">
            <button onClick={() => setView('profile')} className="w-full p-4 flex justify-between items-center hover:bg-stone-50 border-b border-stone-100 transition-colors">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-stone-400" />
                <span className="text-sm font-medium">Profile Information</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </button>
            <button onClick={() => setView('notifications')} className="w-full p-4 flex justify-between items-center hover:bg-stone-50 border-b border-stone-100 transition-colors">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-stone-400" />
                <span className="text-sm font-medium">Notification Preferences</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </button>
            <button 
              onClick={() => {
                // Sign out logic
                setView('splash');
                setChatHistory([]);
                setAnalysis(null);
                setCapturedImage(null);
              }} 
              className="w-full p-4 flex justify-between items-center hover:bg-stone-50 transition-colors"
            >
              <span className="text-sm font-medium text-red-600">Sign Out</span>
            </button>
          </Card>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Support</h3>
          <Card className="p-0 overflow-hidden">
            <button onClick={() => setView('help')} className="w-full p-4 flex justify-between items-center hover:bg-stone-50 border-b border-stone-100 transition-colors">
              <div className="flex items-center gap-3">
                <Info className="w-4 h-4 text-stone-400" />
                <span className="text-sm font-medium">Help Center & FAQs</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </button>
            <button onClick={() => alert("Contacting support at support@recycleassistant.eco")} className="w-full p-4 flex justify-between items-center hover:bg-stone-50 transition-colors">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-4 h-4 text-stone-400" />
                <span className="text-sm font-medium">Contact Support</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </button>
          </Card>
        </section>
      </div>
    </div>
  );

  const ProfileView = () => {
    const [name, setName] = useState(userInfo.name);
    const [email, setEmail] = useState(userInfo.email);
    const [zip, setZip] = useState(userLocation.zipCode);
    const [city, setCity] = useState(userLocation.city);

    const handleSave = () => {
      setUserInfo({ name, email });
      setUserLocation(prev => ({ ...prev, zipCode: zip, city }));
      setView('settings');
    };

    return (
      <div className="h-full flex flex-col bg-[#f8f9fa]">
        <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
          <button onClick={() => setView('settings')} className="p-2 hover:bg-stone-100 rounded-full">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold">Profile Information</h2>
        </div>
        <div className="flex-1 p-6 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center relative">
              <User className="w-12 h-12 text-emerald-600" />
              <button className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border border-stone-100">
                <Camera className="w-4 h-4 text-stone-600" />
              </button>
            </div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Change Photo</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Full Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">City</label>
                <input 
                  type="text" 
                  value={city} 
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">ZIP Code</label>
                <input 
                  type="text" 
                  value={zip} 
                  onChange={(e) => setZip(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" 
                />
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 bg-white border-t border-stone-100">
          <Button onClick={handleSave} className="w-full">Save Changes</Button>
        </div>
      </div>
    );
  };

  const NotificationView = () => {
    const toggle = (key: keyof typeof notifSettings) => {
      setNotifSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
      <div className="h-full flex flex-col bg-[#f8f9fa]">
        <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
          <button onClick={() => setView('settings')} className="p-2 hover:bg-stone-100 rounded-full">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold">Notification Preferences</h2>
        </div>
        <div className="flex-1 p-6 space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-bold text-stone-900">Stay Informed</h3>
            <p className="text-sm text-stone-500 leading-relaxed">Choose how you want to be notified about local recycling updates and events.</p>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-stone-100">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-stone-800">Trash Pickup Reminders</p>
                <p className="text-xs text-stone-500">Alerts for your local collection days.</p>
              </div>
              <button 
                onClick={() => toggle('pickup')}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  notifSettings.pickup ? "bg-emerald-600" : "bg-stone-200"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  notifSettings.pickup ? "left-7" : "left-1"
                )} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-between border-b border-stone-100">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-stone-800">City Rule Updates</p>
                <p className="text-xs text-stone-500">Notifications when local recycling laws change.</p>
              </div>
              <button 
                onClick={() => toggle('rules')}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  notifSettings.rules ? "bg-emerald-600" : "bg-stone-200"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  notifSettings.rules ? "left-7" : "left-1"
                )} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-stone-800">Nearby Drop-Off Events</p>
                <p className="text-xs text-stone-500">Alerts for hazardous waste or e-waste drives.</p>
              </div>
              <button 
                onClick={() => toggle('events')}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  notifSettings.events ? "bg-emerald-600" : "bg-stone-200"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  notifSettings.events ? "left-7" : "left-1"
                )} />
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const HelpView = () => (
    <div className="h-full flex flex-col bg-[#f8f9fa]">
      <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
        <button onClick={() => setView('settings')} className="p-2 hover:bg-stone-100 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="font-bold">Help Center</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <section className="space-y-4">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">FAQs</h3>
          <div className="space-y-3">
            {[
              { q: "How accurate is the AI scanner?", a: "Our AI is trained on millions of waste items and has a 95%+ accuracy rate. It cross-references visual data with local rules." },
              { q: "What if my city isn't listed?", a: "We are constantly expanding our database. If your city is missing, we use state-level default rules until local data is added." },
              { q: "How do I report a wrong classification?", a: "On the result screen, tap 'Report Misclassification' at the bottom to help us improve." }
            ].map((faq, i) => (
              <Card key={i} className="space-y-2 p-5">
                <p className="text-sm font-bold text-stone-800">{faq.q}</p>
                <p className="text-xs text-stone-600 leading-relaxed">{faq.a}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">AI Explained</h3>
          <Card className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-bold text-stone-800">Computer Vision & Watson</h4>
              <p className="text-sm text-stone-600 leading-relaxed">
                We use advanced neural networks to identify the physical properties of items. This includes material type (plastic #1-7, aluminum, etc.) and potential contaminants (food residue, grease).
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-stone-800">Rule Engine Logic</h4>
              <p className="text-sm text-stone-600 leading-relaxed">
                Once identified, the item is checked against a database of municipal rules. These rules are updated weekly to ensure compliance with local recycling facility capabilities.
              </p>
            </div>
          </Card>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Contact Support</h3>
          <Card className="text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <MessageCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-stone-800">Need more help?</p>
              <p className="text-xs text-stone-500">Our team is available Mon-Fri, 9am-5pm PST.</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => alert("Opening email client...")}>Email Support</Button>
          </Card>
        </section>
      </div>
    </div>
  );

  const RulesView = () => {
    const [searchCity, setSearchCity] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
      const timer = setTimeout(async () => {
        if (searchCity.length > 2) {
          try {
            const data = await getCitySuggestions(searchCity);
            setSuggestions(data);
            setShowSuggestions(true);
          } catch (err) {
            console.error(err);
          }
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    }, [searchCity]);

    const handleSearch = (city: string) => {
      setSearchCity(city);
      setShowSuggestions(false);
      fetchRules(city);
    };

    const handleSetDefault = () => {
      if (localRules) {
        setUserLocation(prev => ({ ...prev, city: localRules.city }));
        alert(`${localRules.city} set as your default location!`);
      }
    };

    return (
      <div className="h-full flex flex-col bg-[#f8f9fa]">
        <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
          <button onClick={() => setView('home')} className="p-2 hover:bg-stone-100 rounded-full active:scale-90 transition-transform">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold">Recycling Roadmap</h2>
        </div>
        
        <div className="p-4 bg-white border-b border-stone-100 sticky top-0 z-20">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
              <Search className="w-4 h-4" />
            </div>
            <input 
              type="text" 
              placeholder="Enter City or County" 
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchCity)}
              className="w-full bg-stone-100 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 w-full bg-white mt-2 rounded-2xl shadow-xl border border-stone-100 overflow-hidden z-30">
                {suggestions.map((s, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleSearch(s)}
                    className="w-full p-4 text-left text-sm hover:bg-stone-50 border-b border-stone-50 last:border-none transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoadingRules ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : localRules ? (
            <div className="space-y-6">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-2xl font-serif font-bold text-stone-900">{localRules.city}</h3>
                  <p className="text-sm text-stone-500">{localRules.county} County Roadmap</p>
                </div>
                <button 
                  onClick={handleSetDefault}
                  className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-100 hover:bg-emerald-100 transition-colors"
                >
                  Set as Default
                </button>
              </div>

              <div className="space-y-4">
                {/* Bin Classifications */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Classification Breakdown</h4>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-blue-600">
                      <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center text-white">
                        <Recycle className="w-3 h-3" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Blue Bin (Recycle)</span>
                    </div>
                    <Card className="bg-blue-50/50 border-blue-100 p-4">
                      <ul className="grid grid-cols-2 gap-2">
                        {localRules.blueBin.map((item, i) => (
                          <li key={i} className="text-xs text-blue-800 flex items-center gap-1.5">
                            <div className="w-1 h-1 bg-blue-400 rounded-full" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <div className="w-5 h-5 bg-emerald-600 rounded flex items-center justify-center text-white">
                        <Leaf className="w-3 h-3" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Green Bin (Compost)</span>
                    </div>
                    <Card className="bg-emerald-50/50 border-emerald-100 p-4">
                      <ul className="grid grid-cols-2 gap-2">
                        {localRules.greenBin.map((item, i) => (
                          <li key={i} className="text-xs text-emerald-800 flex items-center gap-1.5">
                            <div className="w-1 h-1 bg-emerald-400 rounded-full" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-stone-600">
                      <div className="w-5 h-5 bg-stone-600 rounded flex items-center justify-center text-white">
                        <Trash2 className="w-3 h-3" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Black Bin (Trash)</span>
                    </div>
                    <Card className="bg-stone-100 border-stone-200 p-4">
                      <ul className="grid grid-cols-2 gap-2">
                        {localRules.blackBin.map((item, i) => (
                          <li key={i} className="text-xs text-stone-800 flex items-center gap-1.5">
                            <div className="w-1 h-1 bg-stone-400 rounded-full" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>
                </div>

                {/* Local Restrictions */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Local Restrictions</h4>
                  <Card className="bg-amber-50 border-amber-100 p-4 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed font-medium">
                      {localRules.specialRestrictions}
                    </p>
                  </Card>
                </div>

                {/* Collection Schedule */}
                {localRules.collectionSchedule && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Collection Schedule</h4>
                    <Card className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center">
                          <History className="w-4 h-4 text-stone-600" />
                        </div>
                        <p className="text-xs text-stone-700 font-medium">{localRules.collectionSchedule}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-400" />
                    </Card>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center">
                <Search className="w-8 h-8 text-stone-300" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-stone-800">No Roadmap Loaded</h4>
                <p className="text-xs text-stone-500 leading-relaxed">Search for your city or county to see local recycling rules and schedules.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const SortingGuideView = () => {
    const [searchQuery, setSearchQuery] = useState('');

    const renderItem = (item: SortingGuideItem, i: number) => (
      <div key={i} className="p-4 bg-white rounded-2xl border border-stone-100 space-y-2 shadow-sm">
        <div className="flex justify-between items-start">
          <h5 className="font-bold text-stone-900">{item.name}</h5>
          <span className={cn(
            "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
            item.isAccepted ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
          )}>
            {item.isAccepted ? 'Accepted' : 'Prohibited'}
          </span>
        </div>
        {item.subCategory && <p className="text-[10px] text-stone-400 uppercase tracking-widest">{item.subCategory}</p>}
        {item.condition && <p className="text-xs text-stone-600 font-medium italic">Condition: {item.condition}</p>}
        {!item.isAccepted && item.reasonIfNo && (
          <p className="text-xs text-red-600 bg-red-50/50 p-2 rounded-lg border border-red-100">
            <span className="font-bold">Why?</span> {item.reasonIfNo}
          </p>
        )}
        {!item.isAccepted && item.nextStep && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
            <ArrowLeft className="w-3 h-3 rotate-180" />
            <span className="font-bold">Next Step:</span> {item.nextStep}
          </div>
        )}
        <p className="text-[8px] text-stone-300 uppercase tracking-tighter text-right">{item.source}</p>
      </div>
    );

    return (
      <div className="h-full flex flex-col bg-[#f8f9fa]">
        <div className="p-4 flex items-center gap-4 bg-white border-b border-stone-100">
          <button onClick={() => setView('home')} className="p-2 hover:bg-stone-100 rounded-full active:scale-90 transition-transform">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold">What Bin Does This Go In?</h2>
        </div>

        <div className="p-4 bg-white border-b border-stone-100 sticky top-0 z-20 space-y-4">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
              <Search className="w-4 h-4" />
            </div>
            <input 
              type="text" 
              placeholder="Search item (e.g., bubble wrap)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchSorting(searchQuery)}
              className="w-full bg-stone-100 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {isSearchingSorting && (
            <div className="flex items-center justify-center py-4">
              <div className="w-6 h-6 border-2 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          )}

          {sortingSearchResult && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Search Result</h4>
              {renderItem(sortingSearchResult, 0)}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {isLoadingSortingGuide ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : sortingGuide ? (
            <div className="space-y-8">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <h3 className="text-2xl font-serif font-bold text-stone-900">{sortingGuide.city}</h3>
                  <p className="text-xs text-stone-400 uppercase tracking-widest">{sortingGuide.source}</p>
                </div>
              </div>

              {/* Accepted Section */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <h4 className="text-sm font-bold uppercase tracking-widest">Accepted Materials</h4>
                </div>
                
                {Object.entries(sortingGuide.accepted).map(([cat, items]) => (
                  <div key={cat} className="space-y-3">
                    <h5 className="text-xs font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1">{cat}</h5>
                    <div className="space-y-3">
                      {items.map((item, i) => renderItem(item, i))}
                    </div>
                  </div>
                ))}
              </section>

              {/* Prohibited Section */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                  <h4 className="text-sm font-bold uppercase tracking-widest">Prohibited Materials</h4>
                </div>
                <div className="space-y-3">
                  {sortingGuide.prohibited.map((item, i) => renderItem(item, i))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="mobile-container">
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {view === 'splash' && <SplashView />}
          {view === 'auth' && <AuthView />}
          {view === 'login' && <LoginView />}
          {view === 'home' && <HomeView />}
          {view === 'camera' && <CameraView />}
          {view === 'result' && <ResultView />}
          {view === 'chat' && <ChatView />}
          {view === 'dropoff' && <DropOffView />}
          {view === 'invite' && <InviteView />}
          {view === 'categories' && <CategoriesView />}
          {view === 'rules' && <RulesView />}
          {view === 'settings' && <SettingsView />}
          {view === 'profile' && <ProfileView />}
          {view === 'notifications' && <NotificationView />}
          {view === 'help' && <HelpView />}
          {view === 'sorting-guide' && <SortingGuideView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
