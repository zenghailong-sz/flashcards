import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PRELOADED_UNITS, INTERVALS_MINUTES } from './constants';
import { FlashcardData, Unit, CardType } from './types';
import Flashcard from './components/Flashcard';
import { 
  Brain, CheckCircle, XCircle, BarChart3, RotateCw, RotateCcw,
  ArrowLeft, ArrowRight, BookOpen, ChevronDown, Plus, 
  Trash2, FileText, Upload, X, Volume2, VolumeX 
} from 'lucide-react';

const REGISTRY_KEY = 'flashcards_app_registry_v1';
const LEGACY_STORAGE_KEY = 'grade8a_unit6_flashcards_v1';
const UNIT_PREFIX = 'flashcards_unit_';

export default function App() {
  // --- State ---
  const [units, setUnits] = useState<Unit[]>([]);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(-1);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionQueue, setSessionQueue] = useState<number[]>([]); 
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });
  
  // UI State
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false); // Default to false to avoid annoyance

  // --- Initialization & Migration ---
  useEffect(() => {
    initializeUnits();
  }, []);

  const initializeUnits = () => {
    const registryRaw = localStorage.getItem(REGISTRY_KEY);
    let registry: Unit[] = [];
    let updatedRegistry = false;

    if (registryRaw) {
      try {
        registry = JSON.parse(registryRaw);
      } catch (e) {
        console.error("Failed to parse registry", e);
      }
    }

    // 1. Check for legacy migration (Unit 6 from single-unit version)
    if (registry.length === 0) {
        const legacyDataRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyDataRaw) {
             try {
                const initialData = JSON.parse(legacyDataRaw);
                const legacyUnitId = 'unit_grade8a_6'; // Map legacy to standardized ID
                
                if(!localStorage.getItem(UNIT_PREFIX + legacyUnitId)) {
                     localStorage.setItem(UNIT_PREFIX + legacyUnitId, JSON.stringify(initialData));
                     registry.push({
                        id: legacyUnitId,
                        name: 'Grade 8A Unit 6',
                        count: initialData.length,
                        createdAt: Date.now()
                     });
                     updatedRegistry = true;
                }
             } catch (e) { console.error("Failed to parse legacy data"); }
        }
    }

    // 2. Preload Default Units (1-6) if they don't exist
    PRELOADED_UNITS.forEach(preload => {
        const exists = registry.some(u => u.id === preload.id);
        if (!exists) {
            if (!localStorage.getItem(UNIT_PREFIX + preload.id)) {
                localStorage.setItem(UNIT_PREFIX + preload.id, JSON.stringify(preload.data));
            }
            registry.push({
                id: preload.id,
                name: preload.name,
                count: preload.data.length,
                createdAt: Date.now()
            });
            updatedRegistry = true;
        }
    });

    registry.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (updatedRegistry) {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    }

    setUnits(registry);
    
    if (registry.length > 0 && !activeUnitId) {
       const unit1 = registry.find(u => u.id === 'unit_grade8a_1');
       loadUnit(unit1 ? unit1.id : registry[0].id);
    }
  };

  const loadUnit = (unitId: string) => {
    const dataRaw = localStorage.getItem(UNIT_PREFIX + unitId);
    let unitCards: FlashcardData[] = [];
    if (dataRaw) {
      try {
        unitCards = JSON.parse(dataRaw);
      } catch (e) { console.error("Failed to load unit data"); }
    } else {
        const preload = PRELOADED_UNITS.find(u => u.id === unitId);
        if (preload) unitCards = preload.data;
    }

    setActiveUnitId(unitId);
    setCards(unitCards);
    setSessionStats({ correct: 0, incorrect: 0 });
    calculateQueue(unitCards);
    setShowUnitMenu(false);
  };

  const deleteUnit = (e: React.MouseEvent, unitId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this unit? This cannot be undone.")) return;

    const newUnits = units.filter(u => u.id !== unitId);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(newUnits));
    localStorage.removeItem(UNIT_PREFIX + unitId);
    setUnits(newUnits);

    if (activeUnitId === unitId) {
      if (newUnits.length > 0) {
        loadUnit(newUnits[0].id);
      } else {
        setCards([]);
        setActiveUnitId(null);
      }
    }
  };

  // --- Audio Logic ---
  const speak = (text: string) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (autoPlay && currentCardIndex !== -1 && cards[currentCardIndex]) {
        // Delay slightly to allow transition
        const timer = setTimeout(() => {
            speak(cards[currentCardIndex].front);
        }, 300);
        return () => clearTimeout(timer);
    }
  }, [currentCardIndex, autoPlay, activeUnitId]);


  // --- Spaced Repetition Logic ---
  const calculateQueue = (data: FlashcardData[]) => {
    const now = Date.now();
    const dueIndices = data
      .map((card, index) => ({ index, card }))
      .filter(item => item.card.nextReview <= now)
      .sort((a, b) => a.card.level - b.card.level) 
      .map(item => item.index);

    setSessionQueue(dueIndices);
    setCurrentCardIndex(dueIndices.length > 0 ? dueIndices[0] : -1);
  };

  const saveCurrentUnitData = (newCards: FlashcardData[]) => {
      if (!activeUnitId) return;
      localStorage.setItem(UNIT_PREFIX + activeUnitId, JSON.stringify(newCards));
  };

  const handleResult = useCallback((success: boolean) => {
    if (currentCardIndex === -1) return;

    setCards(prevCards => {
      const newCards = [...prevCards];
      const card = newCards[currentCardIndex];
      let newLevel = card.level;
      
      if (success) {
        newLevel = Math.min(card.level + 1, INTERVALS_MINUTES.length - 1);
        setSessionStats(prev => ({ ...prev, correct: prev.correct + 1 }));
      } else {
        newLevel = 0; 
        setSessionStats(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      }

      const minutesToAdd = INTERVALS_MINUTES[newLevel];
      const nextReviewTime = Date.now() + (minutesToAdd * 60 * 1000);

      newCards[currentCardIndex] = {
        ...card,
        level: newLevel,
        nextReview: nextReviewTime,
        lastReviewed: Date.now()
      };

      saveCurrentUnitData(newCards);

      setSessionQueue(prevQueue => {
        const remaining = prevQueue.slice(1);
        return remaining;
      });

      return newCards;
    });

    setIsFlipped(false);
  }, [currentCardIndex, activeUnitId]);

  useEffect(() => {
    if (sessionQueue.length > 0) {
      setCurrentCardIndex(sessionQueue[0]);
    } else {
      setCurrentCardIndex(-1);
    }
  }, [sessionQueue]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showImportModal || showUnitMenu) return; 
      if (currentCardIndex === -1) return;

      if (e.code === 'Space') {
        e.preventDefault(); 
        setIsFlipped(prev => !prev);
      } else if (e.code === 'ArrowLeft') {
        if (isFlipped) handleResult(false);
      } else if (e.code === 'ArrowRight') {
        if (isFlipped) handleResult(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCardIndex, isFlipped, handleResult, showImportModal, showUnitMenu]);

  // --- Stats ---
  const stats = useMemo(() => {
    const total = cards.length;
    const mastered = cards.filter(c => c.level >= 4).length;
    const learning = total - mastered;
    const due = sessionQueue.length;
    return { total, mastered, learning, due };
  }, [cards, sessionQueue]);

  const getProgressWidth = () => {
    if (stats.total === 0) return 0;
    return (stats.mastered / stats.total) * 100;
  };

  const handleReset = () => {
    if (!activeUnitId) return;

    // Check if there is actually progress to reset
    const hasProgress = cards.some(c => c.level > 0);

    if (!hasProgress) {
        alert("Current progress is already 0%. No need to reset.\n(当前进度已经是0%，无需重置)");
        return;
    }

    if(confirm("Are you sure you want to RESET progress for this unit?\nYour memory history will be cleared.\n(确定要重置当前单元的学习进度吗？)")) {
        const resetCards = cards.map(c => ({
            ...c,
            level: 0,
            nextReview: 0,
            lastReviewed: undefined
        }));
        setCards(resetCards);
        saveCurrentUnitData(resetCards);
        calculateQueue(resetCards);
        setSessionStats({ correct: 0, incorrect: 0 });
        alert("Progress has been reset.\n(进度已重置)");
    }
  }

  const currentUnitName = useMemo(() => {
    return units.find(u => u.id === activeUnitId)?.name || "Select Unit";
  }, [units, activeUnitId]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-gray-800 font-sans">
      
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          
          {/* Unit Switcher Button */}
          <button 
            onClick={() => setShowUnitMenu(true)}
            className="flex items-center gap-3 hover:bg-gray-50 p-2 -ml-2 rounded-lg transition-colors group"
          >
            <div className="bg-indigo-600 p-2 rounded-lg text-white group-hover:bg-indigo-700 transition-colors">
              <BookOpen size={24} />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                 <h1 className="text-xl font-bold text-gray-900 tracking-tight">{currentUnitName}</h1>
                 <ChevronDown size={16} className="text-gray-400" />
              </div>
              <p className="text-xs text-gray-500">{stats.total} Flashcards</p>
            </div>
          </button>

          <div className="flex items-center gap-3">
             {/* Auto Play Toggle */}
             <button 
               onClick={() => setAutoPlay(!autoPlay)}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                 autoPlay 
                  ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
               }`}
             >
               {autoPlay ? <Volume2 size={14} /> : <VolumeX size={14} />}
               {autoPlay ? 'Auto-Read: ON' : 'Auto-Read: OFF'}
             </button>

             <button 
                onClick={handleReset}
                className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50"
                title="Reset Unit Progress"
            >
                <RotateCw size={18} /> 
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
        
        {/* Stats Dashboard */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <RotateCcw size={18} />
              <span className="text-sm font-semibold">Due Now</span>
            </div>
            <p className="text-2xl font-bold">{stats.due}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Brain size={18} />
              <span className="text-sm font-semibold">Mastered</span>
            </div>
            <p className="text-2xl font-bold">{stats.mastered}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <BarChart3 size={18} />
              <span className="text-sm font-semibold">Total</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" 
            style={{ width: `${getProgressWidth()}%` }}
          ></div>
        </div>

        {/* Card Area */}
        <div className="flex-1 flex flex-col justify-center min-h-[400px]">
          {activeUnitId && currentCardIndex !== -1 ? (
            <>
              <div className="mb-8">
                 <Flashcard 
                    data={cards[currentCardIndex]} 
                    isFlipped={isFlipped} 
                    onFlip={() => setIsFlipped(!isFlipped)} 
                 />
              </div>

              {/* Controls */}
              <div className={`transition-opacity duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex justify-center items-center gap-6">
                  <button 
                    onClick={() => handleResult(false)}
                    className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-full font-semibold hover:bg-red-100 transition-colors ring-1 ring-red-200 shadow-sm"
                  >
                    <ArrowLeft size={20} />
                    <XCircle size={20} />
                    Forgot
                  </button>
                  <div className="text-gray-400 text-sm font-medium">
                    Use Arrow Keys
                  </div>
                  <button 
                    onClick={() => handleResult(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-green-50 text-green-600 rounded-full font-semibold hover:bg-green-100 transition-colors ring-1 ring-green-200 shadow-sm"
                  >
                    Remembered
                    <CheckCircle size={20} />
                    <ArrowRight size={20} />
                  </button>
                </div>
              </div>
              
              {!isFlipped && (
                  <div className="text-center text-gray-400 text-sm mt-4 animate-bounce">
                      Tap card or press Space to reveal
                  </div>
              )}
            </>
          ) : activeUnitId ? (
            <div className="flex flex-col items-center justify-center text-center h-80 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300 p-8">
              <div className="bg-green-100 p-4 rounded-full mb-4 text-green-600">
                <CheckCircle size={48} />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">All Caught Up!</h2>
              <p className="text-gray-500 max-w-md">
                You have reviewed all due flashcards for this unit.
              </p>
              <div className="mt-6 flex gap-4 text-sm text-gray-400">
                <span>Session Correct: {sessionStats.correct}</span>
                <span>•</span>
                <span>Session Incorrect: {sessionStats.incorrect}</span>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">Please select or create a unit to start learning.</div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-gray-400 text-sm">
        <p>Supports Spacebar (Flip), Left Arrow (Forgot), Right Arrow (Remembered)</p>
      </footer>

      {/* --- MODALS --- */}

      {/* Unit Menu Modal */}
      {showUnitMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowUnitMenu(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <BookOpen size={18} /> My Units
              </h3>
              <button onClick={() => setShowUnitMenu(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-2">
              {units.map(unit => (
                <div 
                  key={unit.id}
                  onClick={() => loadUnit(unit.id)}
                  className={`p-4 rounded-xl cursor-pointer flex justify-between items-center group mb-2 transition-all ${
                    activeUnitId === unit.id 
                    ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' 
                    : 'hover:bg-gray-50 border border-transparent hover:border-gray-200'
                  }`}
                >
                  <div>
                    <h4 className={`font-bold ${activeUnitId === unit.id ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {unit.name}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">{unit.count} Cards • {new Date(unit.createdAt).toLocaleDateString()}</p>
                  </div>
                  {activeUnitId === unit.id ? (
                     <CheckCircle size={20} className="text-indigo-600" />
                  ) : (
                     <button 
                       onClick={(e) => deleteUnit(e, unit.id)}
                       className="text-gray-300 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                       title="Delete Unit"
                     >
                       <Trash2 size={18} />
                     </button>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100">
               <button 
                 onClick={() => { setShowUnitMenu(false); setShowImportModal(true); }}
                 className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
               >
                 <Plus size={20} /> Upload New Unit
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal 
          onClose={() => setShowImportModal(false)} 
          onImport={(name, data) => {
            const newId = 'unit_' + Date.now();
            const newUnit: Unit = {
              id: newId,
              name: name,
              count: data.length,
              createdAt: Date.now()
            };
            
            // Add required fields
            const formattedData = data.map((item, idx) => ({
              ...item,
              id: `card-${newId}-${idx}`,
              level: 0,
              nextReview: 0,
              type: item.type || CardType.WORD
            }));

            localStorage.setItem(UNIT_PREFIX + newId, JSON.stringify(formattedData));
            const updatedUnits = [...units, newUnit];
            localStorage.setItem(REGISTRY_KEY, JSON.stringify(updatedUnits));
            setUnits(updatedUnits);
            
            loadUnit(newId);
            setShowImportModal(false);
          }}
        />
      )}

    </div>
  );
}

// --- Helper Components ---

const ImportModal = ({ onClose, onImport }: { onClose: () => void, onImport: (name: string, data: any[]) => void }) => {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'json' | 'text'>('json');
  const [error, setError] = useState('');

  const handleImport = () => {
    if (!name.trim()) { setError("Please enter a unit name"); return; }
    if (!text.trim()) { setError("Please enter content"); return; }

    try {
      let data = [];
      if (mode === 'json') {
        data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("JSON must be an array");
      } else {
        // Simple text parsing: "Front | Back" per line
        data = text.split('\n').filter(line => line.trim()).map(line => {
          const parts = line.split(/[|:-]+/).map(s => s.trim());
          if (parts.length < 2) return null;
          return {
             front: parts[0],
             back: parts.slice(1).join('; '), // Join rest as meaning
             type: CardType.WORD
          };
        }).filter(Boolean);
        if (data.length === 0) throw new Error("No valid lines found. Use format: Word | Meaning");
      }
      
      onImport(name, data);
    } catch (e: any) {
      setError("Invalid Format: " + e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg relative z-10 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <Upload size={20} className="text-indigo-600" /> Upload / Import Unit
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Name</label>
              <input 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Grade 8A Unit 7"
                className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex gap-4 border-b border-gray-100 pb-2">
               <button 
                 onClick={() => setMode('json')}
                 className={`text-sm font-semibold pb-2 ${mode === 'json' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
               >
                 JSON Paste
               </button>
               <button 
                 onClick={() => setMode('text')}
                 className={`text-sm font-semibold pb-2 ${mode === 'text' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
               >
                 Simple Text Paste
               </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {mode === 'json' ? 'Paste JSON Array' : 'Paste Text (Word | Meaning)'}
              </label>
              <textarea 
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={mode === 'json' ? '[{"front": "apple", "back": "苹果"}, ...]' : 'apple | 苹果\nbanana | 香蕉'}
                className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 h-48 font-mono text-sm"
              />
               <p className="text-xs text-gray-400 mt-2">
                {mode === 'json' ? 'Supports full structure: front, back, pos, type.' : 'Paste content from PDF. Format: English Word | Chinese Meaning'}
              </p>
            </div>
            
            {error && <p className="text-red-500 text-sm bg-red-50 p-2 rounded-lg">{error}</p>}
          </div>
        </div>

        <div className="p-6 border-t border-gray-100">
          <button 
            onClick={handleImport}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
          >
            Create Unit
          </button>
        </div>
      </div>
    </div>
  );
};