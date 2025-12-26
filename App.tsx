import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PRELOADED_UNITS, INTERVALS_MINUTES } from './constants';
import { FlashcardData, Unit, CardType } from './types';
import Flashcard from './components/Flashcard';
import { 
  Brain, CheckCircle, BarChart3, RotateCw, RotateCcw,
  ArrowLeft, ArrowRight, BookOpen, ChevronDown, 
  X, Volume2, VolumeX, Info, Activity, Zap, Keyboard, Play, SkipBack, SkipForward, XCircle, Filter, AlertTriangle
} from 'lucide-react';

const REGISTRY_KEY = 'flashcards_app_registry_v1';
const LEGACY_STORAGE_KEY = 'grade8a_unit6_flashcards_v1';
const UNIT_PREFIX = 'flashcards_unit_';

type FilterType = 'all' | 'word' | 'phrase';

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
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false); // Custom confirmation modal state
  const [autoPlay, setAutoPlay] = useState(false); 
  const [studyMode, setStudyMode] = useState<'read' | 'spell'>('read');
  const [cardFilter, setCardFilter] = useState<FilterType>('all');

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

    // 1. Check for legacy migration
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

    // 2. Preload Default Units
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
       // Default to Unit 1 or the first available
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
    
    const queue = calculateQueue(unitCards, cardFilter);
    setSessionQueue(queue);
    
    // Set initial index based on current mode & filter
    const initialIndex = getInitialIndex(unitCards, studyMode, cardFilter, queue);
    setCurrentCardIndex(initialIndex);
    
    setShowUnitMenu(false);
  };

  // Helper to determine filter match
  const isCardInFilter = (card: FlashcardData, filter: FilterType) => {
      if (filter === 'all') return true;
      if (filter === 'word') return card.type === CardType.WORD;
      if (filter === 'phrase') return card.type === CardType.PHRASE;
      return true;
  };

  // Helper to get initial index
  const getInitialIndex = (data: FlashcardData[], mode: string, filter: FilterType, queue: number[]) => {
      if (mode === 'spell') {
          return queue.length > 0 ? queue[0] : -1;
      } else {
          // Read mode: find first card matching filter
          const idx = data.findIndex(c => isCardInFilter(c, filter));
          return idx;
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
    // Auto-play logic: works in both Read mode (browsing) and Spell mode (dictation)
    if (autoPlay && currentCardIndex !== -1 && cards[currentCardIndex]) {
        const timer = setTimeout(() => {
            speak(cards[currentCardIndex].front);
        }, 300);
        return () => clearTimeout(timer);
    }
  }, [currentCardIndex, autoPlay, activeUnitId]);


  // --- Spaced Repetition Queue Logic ---
  const calculateQueue = (data: FlashcardData[], filter: FilterType) => {
    const now = Date.now();
    return data
      .map((card, index) => ({ index, card }))
      .filter(item => item.card.nextReview <= now && isCardInFilter(item.card, filter))
      .sort((a, b) => a.card.level - b.card.level) 
      .map(item => item.index);
  };

  // --- Filter Change Effect ---
  // When filter changes, update queue and current index
  useEffect(() => {
      if (cards.length === 0) return;

      // 1. Recalculate Queue for Spell Mode
      const newQueue = calculateQueue(cards, cardFilter);
      setSessionQueue(newQueue);

      // 2. Adjust Current Card Index
      if (studyMode === 'spell') {
          setCurrentCardIndex(newQueue.length > 0 ? newQueue[0] : -1);
      } else {
          // In read mode, ensure current card matches filter, or find nearest
          if (currentCardIndex !== -1 && isCardInFilter(cards[currentCardIndex], cardFilter)) {
              // Current is valid, keep it
          } else {
              // Find first valid from beginning (Simplest UX for filter change)
              const firstValid = cards.findIndex(c => isCardInFilter(c, cardFilter));
              setCurrentCardIndex(firstValid);
          }
      }
      setIsFlipped(false);
  }, [cardFilter, studyMode]); 


  const saveCurrentUnitData = (newCards: FlashcardData[]) => {
      if (!activeUnitId) return;
      localStorage.setItem(UNIT_PREFIX + activeUnitId, JSON.stringify(newCards));
  };

  // --- Handlers ---

  const handleSpellResult = useCallback((success: boolean) => {
    if (currentCardIndex === -1 || studyMode !== 'spell') return;

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
        setCurrentCardIndex(remaining.length > 0 ? remaining[0] : -1);
        return remaining;
      });

      return newCards;
    });
  }, [currentCardIndex, studyMode]);

  const handleReadNavigation = useCallback((direction: 'prev' | 'next') => {
      if (studyMode !== 'read') return;
      
      let newIndex = currentCardIndex;
      let attempts = 0;
      const total = cards.length;

      // Loop to find next card that matches filter
      while (attempts < total) {
          if (direction === 'prev') {
              newIndex = newIndex > 0 ? newIndex - 1 : total - 1;
          } else {
              newIndex = newIndex < total - 1 ? newIndex + 1 : 0;
          }

          if (isCardInFilter(cards[newIndex], cardFilter)) {
              setCurrentCardIndex(newIndex);
              return;
          }
          attempts++;
      }
  }, [cards, studyMode, cardFilter, currentCardIndex]);

  // --- Mode Switching Effect ---
  useEffect(() => {
      if (cards.length === 0) return;

      if (studyMode === 'spell') {
           if (sessionQueue.length > 0) {
               setCurrentCardIndex(sessionQueue[0]);
           } else {
               setCurrentCardIndex(-1);
           }
      } else {
           if (currentCardIndex === -1 || !isCardInFilter(cards[currentCardIndex], cardFilter)) {
                const idx = cards.findIndex(c => isCardInFilter(c, cardFilter));
                setCurrentCardIndex(idx);
           }
      }
      setIsFlipped(false);
  }, [studyMode]);


  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showUnitMenu || showInfoModal || showResetConfirm) return; 
      if (currentCardIndex === -1) return;

      if (studyMode === 'spell') {
          return;
      }

      if (e.code === 'Space') {
        e.preventDefault(); 
        setIsFlipped(prev => !prev);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleReadNavigation('prev');
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleReadNavigation('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCardIndex, isFlipped, handleReadNavigation, showUnitMenu, showInfoModal, showResetConfirm, studyMode]);

  // --- Stats ---
  const stats = useMemo(() => {
    const filteredCards = cards.filter(c => isCardInFilter(c, cardFilter));
    
    const total = filteredCards.length;
    const mastered = filteredCards.filter(c => c.level >= 4).length;
    const now = Date.now();
    const due = filteredCards.filter(c => c.nextReview <= now).length;
    
    return { total, mastered, due };
  }, [cards, sessionQueue, cardFilter]);

  const getProgressWidth = () => {
    if (stats.total === 0) return 0;
    return (stats.mastered / stats.total) * 100;
  };

  const handleResetClick = () => {
    if (!activeUnitId) return;
    setShowResetConfirm(true);
  }

  const executeReset = () => {
      const resetCards = cards.map(c => ({
          ...c,
          level: 0,
          nextReview: 0,
          lastReviewed: undefined
      }));
      setCards(resetCards);
      saveCurrentUnitData(resetCards);
      
      const newQueue = calculateQueue(resetCards, cardFilter);
      setSessionQueue(newQueue);
      
      setSessionStats({ correct: 0, incorrect: 0 });
      
      if (studyMode === 'spell') {
          setCurrentCardIndex(newQueue.length > 0 ? newQueue[0] : -1);
      } else {
          setCurrentCardIndex(resetCards.findIndex(c => isCardInFilter(c, cardFilter)));
      }
      setShowResetConfirm(false);
  };

  const toggleFilter = () => {
      setCardFilter(prev => {
          if (prev === 'all') return 'word';
          if (prev === 'word') return 'phrase';
          return 'all';
      });
  };

  const getFilterLabel = () => {
      switch(cardFilter) {
          case 'word': return '仅单词';
          case 'phrase': return '仅词组';
          default: return '全部';
      }
  };

  const currentUnitName = useMemo(() => {
    return units.find(u => u.id === activeUnitId)?.name || "请选择单元";
  }, [units, activeUnitId]);

  // Derived state for confirmation modal message
  const hasProgress = useMemo(() => cards.some(c => c.level > 0), [cards]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-gray-800 font-sans">
      
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-3 py-3 sm:px-4 sm:py-4 flex justify-between items-center">
          
          {/* Unit Switcher Button */}
          <button 
            onClick={() => setShowUnitMenu(true)}
            className="flex items-center gap-2 sm:gap-3 hover:bg-gray-50 p-1.5 -ml-1.5 sm:p-2 sm:-ml-2 rounded-lg transition-colors group max-w-[50%] sm:max-w-none"
          >
            <div className="bg-indigo-600 p-1.5 sm:p-2 rounded-lg text-white group-hover:bg-indigo-700 transition-colors shrink-0">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="text-left overflow-hidden">
              <div className="flex items-center gap-1 sm:gap-2">
                 <h1 className="text-sm sm:text-xl font-bold text-gray-900 tracking-tight truncate">{currentUnitName}</h1>
                 <ChevronDown size={16} className="text-gray-400 shrink-0" />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-500 truncate">{stats.total} 张卡片</p>
            </div>
          </button>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
             
             {/* Filter Toggle */}
             <button
                onClick={toggleFilter}
                className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-full text-[10px] sm:text-xs font-semibold transition-all border ${
                    cardFilter !== 'all' 
                    ? 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-100' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title="切换筛选：全部 / 单词 / 词组"
             >
                <Filter size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{getFilterLabel()}</span>
                <span className="sm:hidden">{cardFilter === 'all' ? '全' : cardFilter === 'word' ? '词' : '组'}</span>
             </button>

             {/* Mode Toggle */}
             <button
                onClick={() => setStudyMode(prev => prev === 'read' ? 'spell' : 'read')}
                className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-full text-[10px] sm:text-xs font-semibold transition-all border ${
                    studyMode === 'spell' 
                    ? 'bg-purple-50 text-purple-700 border-purple-200 ring-1 ring-purple-100' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title={studyMode === 'read' ? '切换到拼写模式 (计入曲线)' : '切换到阅读模式 (仅浏览)'}
             >
                {studyMode === 'spell' ? <Keyboard size={14} className="sm:w-4 sm:h-4" /> : <BookOpen size={14} className="sm:w-4 sm:h-4" />}
                <span className="hidden sm:inline">{studyMode === 'spell' ? '拼写' : '翻转'}</span>
             </button>

             {/* Auto Play Toggle */}
             <button 
                onClick={() => setAutoPlay(!autoPlay)}
                className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-full text-[10px] sm:text-xs font-semibold transition-all ${
                    autoPlay 
                    ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' 
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={autoPlay ? "关闭自动朗读" : "开启自动朗读 (拼写模式下为听写)"}
             >
                {autoPlay ? <Volume2 size={14} className="sm:w-4 sm:h-4" /> : <VolumeX size={14} className="sm:w-4 sm:h-4" />}
                <span className="hidden sm:inline">朗读</span>
             </button>
             
             <div className="h-4 sm:h-6 w-px bg-gray-200 mx-1 sm:mx-2"></div>

             <button 
                onClick={handleResetClick}
                className="text-gray-400 hover:text-red-500 transition-colors p-1.5 sm:p-2 rounded-full hover:bg-red-50"
                title="重置单元进度"
            >
                <RotateCw className="w-5 h-5 sm:w-5 sm:h-5" /> 
            </button>
            <button 
                onClick={() => setShowInfoModal(true)}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1.5 sm:p-2 rounded-full hover:bg-blue-50"
                title="记忆算法说明"
            >
                <Info className="w-5 h-5 sm:w-5 sm:h-5" /> 
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-8 flex flex-col gap-4 sm:gap-8">
        
        {/* Stats Dashboard */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-white p-2 sm:p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center sm:items-start text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-blue-600 mb-0.5 sm:mb-1">
              <RotateCcw className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              <span className="text-[10px] sm:text-sm font-semibold">待复习</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold">{stats.due}</p>
          </div>
          <div className="bg-white p-2 sm:p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center sm:items-start text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-green-600 mb-0.5 sm:mb-1">
              <Brain className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              <span className="text-[10px] sm:text-sm font-semibold">已掌握</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold">{stats.mastered}</p>
          </div>
          <div className="bg-white p-2 sm:p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center sm:items-start text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-purple-600 mb-0.5 sm:mb-1">
              <BarChart3 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              <span className="text-[10px] sm:text-sm font-semibold">总量</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 sm:h-2.5">
          <div 
            className="bg-indigo-600 h-2 sm:h-2.5 rounded-full transition-all duration-500" 
            style={{ width: `${getProgressWidth()}%` }}
          ></div>
        </div>

        {/* Card Area */}
        <div className="flex-1 flex flex-col justify-center min-h-[300px] sm:min-h-[400px]">
          {activeUnitId && currentCardIndex !== -1 ? (
            <>
              {/* Pagination Info */}
              <div className="text-center text-gray-400 text-xs sm:text-sm mb-2 font-mono">
                  {cards.filter(c => isCardInFilter(c, cardFilter)).findIndex(c => c.id === cards[currentCardIndex]?.id) + 1} / {stats.total}
              </div>

              <div className="mb-4 sm:mb-8">
                 <Flashcard 
                    data={cards[currentCardIndex]} 
                    isFlipped={isFlipped} 
                    onFlip={() => setIsFlipped(!isFlipped)}
                    mode={studyMode}
                    onResult={handleSpellResult}
                 />
              </div>

              {/* Controls (Only visible in READ mode) */}
              {studyMode === 'read' && (
                  <div className="flex justify-center items-center gap-3 sm:gap-6">
                    <button 
                      onClick={() => handleReadNavigation('prev')}
                      className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-white text-gray-600 rounded-full font-semibold hover:bg-gray-50 transition-colors border border-gray-200 shadow-sm text-sm sm:text-base"
                    >
                      <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                      上一个
                    </button>
                    
                    <div className="hidden sm:block text-gray-400 text-sm font-medium">
                      方向键切换
                    </div>
                    
                    <button 
                      onClick={() => handleReadNavigation('next')}
                      className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-white text-gray-600 rounded-full font-semibold hover:bg-gray-50 transition-colors border border-gray-200 shadow-sm text-sm sm:text-base"
                    >
                      下一个
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
              )}
              
              {/* Hints */}
              {studyMode === 'read' && !isFlipped && (
                  <div className="text-center text-gray-400 text-xs sm:text-sm mt-4 animate-bounce">
                      点击卡片或按空格键翻开
                  </div>
              )}
               {studyMode === 'spell' && (
                  <div className="text-center text-gray-400 text-xs sm:text-sm mt-4">
                      请输入对应的英文，按回车键确认
                  </div>
              )}
            </>
          ) : activeUnitId ? (
             studyMode === 'spell' ? (
                <div className="flex flex-col items-center justify-center text-center h-64 sm:h-80 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300 p-4 sm:p-8">
                   {stats.due > 0 ? (
                    <>
                       <div className="bg-blue-100 p-3 sm:p-4 rounded-full mb-4 text-blue-600">
                         <RotateCw className="w-10 h-10 sm:w-12 sm:h-12" />
                       </div>
                       <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">本轮结束，继续加油！</h2>
                       <p className="text-gray-500 text-sm sm:text-base max-w-md mb-6">
                         还有 {stats.due} 张卡片需要复习（包含刚才错误的）。
                       </p>
                       <button
                         onClick={() => {
                             const newQueue = calculateQueue(cards, cardFilter);
                             setSessionQueue(newQueue);
                             setSessionStats({ correct: 0, incorrect: 0 });
                             setCurrentCardIndex(newQueue.length > 0 ? newQueue[0] : -1);
                         }}
                         className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold transition-all shadow-md hover:shadow-lg"
                       >
                         <Play size={18} fill="currentColor" /> 继续复习 ({stats.due})
                       </button>
                    </>
                  ) : (
                    <>
                      <div className="bg-green-100 p-3 sm:p-4 rounded-full mb-4 text-green-600">
                        <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12" />
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">复习完成！</h2>
                      <p className="text-gray-500 text-sm sm:text-base max-w-md">
                        {cardFilter === 'all' ? '当前单元所有待复习卡片已完成。' : `当前"${getFilterLabel()}"类别下的待复习卡片已完成。`}
                      </p>
                    </>
                  )}
                  <div className="mt-6 flex gap-4 text-xs sm:text-sm text-gray-400">
                    <span>本次正确: {sessionStats.correct}</span>
                    <span>•</span>
                    <span>本次错误: {sessionStats.incorrect}</span>
                  </div>
                </div>
             ) : (
                 <div className="text-center text-gray-500">
                     <p>该单元没有符合条件的卡片。</p>
                 </div>
             )
          ) : (
            <div className="text-center text-gray-500">请选择一个单元开始学习。</div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 sm:py-6 text-center text-gray-400 text-xs sm:text-sm">
        {studyMode === 'read' ? (
           <>
             <p className="hidden sm:block">支持按键：空格键 (翻转)，左方向键 (上一个)，右方向键 (下一个)</p>
             <p className="sm:hidden">点击卡片翻转，底部按钮切换</p>
           </>
        ) : (
           <p>在输入框中输入英文，按 Enter 键提交 (计入复习进度)</p>
        )}
      </footer>

      {/* --- MODALS --- */}

      {/* Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${hasProgress ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                {hasProgress ? <AlertTriangle size={24} /> : <RotateCw size={24} />}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {hasProgress ? '重置学习进度' : '重新开始'}
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                {hasProgress 
                  ? '确定要重置当前单元的学习进度吗？您的记忆历史将被清空，所有卡片将变回“陌生”状态。' 
                  : '确定要从头开始当前单元的学习吗？'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={executeReset}
                  className={`flex-1 px-4 py-2 text-white rounded-lg font-medium shadow-sm transition-colors ${hasProgress ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {hasProgress ? '确认重置' : '确认重启'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unit Menu Modal */}
      {showUnitMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowUnitMenu(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <BookOpen size={18} /> 选择单元
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
                  className={`p-3 sm:p-4 rounded-xl cursor-pointer flex justify-between items-center group mb-2 transition-all ${
                    activeUnitId === unit.id 
                    ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' 
                    : 'hover:bg-gray-50 border border-transparent hover:border-gray-200'
                  }`}
                >
                  <div className="overflow-hidden">
                    <h4 className={`font-bold truncate ${activeUnitId === unit.id ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {unit.name}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">{unit.count} 张卡片</p>
                  </div>
                  {activeUnitId === unit.id && (
                     <CheckCircle size={20} className="text-indigo-600 shrink-0 ml-2" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Info / Ebbinghaus Explanation Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowInfoModal(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
                <Brain className="w-5 h-5" /> 
                艾宾浩斯记忆算法说明
              </h3>
              <button onClick={() => setShowInfoModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            {/* Content */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4 sm:space-y-6">
              
              {/* Introduction */}
              <div className="bg-blue-50 p-3 sm:p-4 rounded-xl text-blue-900 text-xs sm:text-sm leading-relaxed">
                <p>
                  本应用采用<b>间隔重复系统 (Spaced Repetition)</b>。根据艾宾浩斯遗忘曲线，人脑在学习新知识后会迅速遗忘。
                  通过在特定时间点（即将遗忘时）进行复习，可以将短期记忆转化为长期记忆。
                </p>
              </div>

              {/* Stages Visualizer */}
              <div>
                <h4 className="font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                  <Activity size={18} className="text-gray-400" />
                  记忆阶段与复习间隔
                </h4>
                <div className="space-y-2 sm:space-y-3">
                  {[
                    { lv: 0, time: '立即', desc: '陌生 / 遗忘', color: 'bg-red-100 text-red-700 border-red-200', icon: <Zap size={14} /> },
                    { lv: 1, time: '10分钟', desc: '刚接触', color: 'bg-orange-50 text-orange-700 border-orange-100', icon: <Activity size={14} /> },
                    { lv: 2, time: '1天', desc: '初始记忆', color: 'bg-yellow-50 text-yellow-700 border-yellow-100', icon: <Activity size={14} /> },
                    { lv: 3, time: '3天', desc: '加深记忆', color: 'bg-blue-50 text-blue-700 border-blue-100', icon: <Activity size={14} /> },
                    { lv: 4, time: '7天', desc: '长期记忆', color: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: <Activity size={14} /> },
                    { lv: 5, time: '14天', desc: '永久记忆', color: 'bg-green-50 text-green-700 border-green-100', icon: <CheckCircle size={14} /> },
                  ].map((stage) => (
                    <div key={stage.lv} className={`flex items-center p-2 sm:p-3 rounded-lg border ${stage.color}`}>
                      <div className="w-8 font-bold text-xs sm:text-sm text-center opacity-60">Lv.{stage.lv}</div>
                      <div className="w-px h-5 sm:h-6 bg-current opacity-20 mx-2 sm:mx-3"></div>
                      <div className="flex-1 font-semibold text-xs sm:text-sm flex items-center gap-2">
                        {stage.icon}
                        {stage.desc}
                      </div>
                      <div className="text-[10px] sm:text-xs font-mono bg-white/50 px-2 py-1 rounded">
                        +{stage.time}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interaction Guide */}
              <div>
                <h4 className="font-bold text-gray-800 mb-3 text-sm sm:text-base">如何操作？</h4>
                <ul className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-gray-600">
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 bg-indigo-100 text-indigo-600 p-1 rounded-full"><BookOpen size={14} /></div>
                    <div>
                      <span className="font-bold text-gray-800">翻转模式（阅读）：</span> 
                      仅用于浏览和短期记忆，<b>不影响</b>记忆曲线和复习进度。
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 bg-purple-100 text-purple-600 p-1 rounded-full"><Keyboard size={14} /></div>
                    <div>
                      <span className="font-bold text-gray-800">拼写模式（复习）：</span> 
                      输入正确英文自动判定为“记得”，升级记忆阶段。
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 bg-red-100 text-red-600 p-1 rounded-full"><XCircle size={14} /></div>
                    <div>
                      <span className="font-bold text-gray-800">忘记（拼写错误）：</span> 
                      重置回 Lv.0，需要立即重新复习。
                    </div>
                  </li>
                </ul>
              </div>

            </div>
            
            {/* Footer */}
            <div className="p-4 bg-gray-50 text-center">
              <button 
                onClick={() => setShowInfoModal(false)}
                className="w-full py-2 bg-white border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-100 transition-colors shadow-sm text-sm"
              >
                明白了
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}