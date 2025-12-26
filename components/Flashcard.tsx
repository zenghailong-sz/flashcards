import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FlashcardData, CardType } from '../types';
import { Volume2, Activity, Zap, Keyboard, ArrowRight } from 'lucide-react';

interface FlashcardProps {
  data: FlashcardData;
  isFlipped: boolean;
  onFlip: () => void;
  mode?: 'read' | 'spell'; // New prop for mode
  onResult?: (success: boolean) => void; // New prop to trigger result from component
}

const Flashcard: React.FC<FlashcardProps> = ({ data, isFlipped, onFlip, mode = 'read', onResult }) => {
  // Spelling Mode State
  const [inputValue, setInputValue] = useState('');
  const [spellStatus, setSpellStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset spelling state when card changes
  useEffect(() => {
    setInputValue('');
    setSpellStatus('idle');
    if (mode === 'spell' && inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [data.id, mode]);

  const handleContinueAfterError = () => {
    if (onResult) onResult(false);
  };

  // Add listener for Enter key when in error state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (spellStatus === 'error' && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleContinueAfterError();
      }
    };
    
    if (spellStatus === 'error') {
        window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spellStatus]);

  const handleSpeak = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(data.front);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const checkSpelling = (e: React.FormEvent) => {
    e.preventDefault();
    if (spellStatus !== 'idle') return;

    const userClean = inputValue.trim().toLowerCase().replace(/\s+/g, ' ');
    const targetClean = data.front.trim().toLowerCase().replace(/\s+/g, ' ');

    if (userClean === targetClean) {
        setSpellStatus('success');
        handleSpeak();
        // Delay before moving to next card
        setTimeout(() => {
            if(onResult) onResult(true);
        }, 1200);
    } else {
        setSpellStatus('error');
    }
  };

  // Helper to determine status display
  const getMemoryStatus = (level: number) => {
    switch (level) {
      case 0: return { label: '陌生 / 需复习', color: 'bg-red-100 text-red-600', icon: <Zap size={12} /> };
      case 1: return { label: '刚接触 (10m)', color: 'bg-orange-100 text-orange-600', icon: <Activity size={12} /> };
      case 2: return { label: '初始记忆 (1d)', color: 'bg-yellow-100 text-yellow-700', icon: <Activity size={12} /> };
      case 3: return { label: '加深记忆 (3d)', color: 'bg-blue-100 text-blue-600', icon: <Activity size={12} /> };
      case 4: return { label: '长期记忆 (7d)', color: 'bg-indigo-100 text-indigo-600', icon: <Activity size={12} /> };
      case 5: return { label: '永久记忆 (14d)', color: 'bg-green-100 text-green-600', icon: <CheckIcon /> };
      default: return { label: '未知', color: 'bg-gray-100 text-gray-500', icon: <Activity size={12} /> };
    }
  };

  const status = getMemoryStatus(data.level);

  // Render memory bars based on level (0-5)
  const renderMemoryBars = () => {
    return (
      <div className="flex gap-1" title={`记忆强度: ${data.level}/5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div 
            key={i} 
            className={`w-1 h-3 sm:w-1.5 sm:h-4 rounded-full ${i <= data.level ? (data.level === 5 ? 'bg-green-400' : 'bg-indigo-400') : 'bg-gray-200'}`}
          />
        ))}
      </div>
    );
  };

  // --- RENDER SPELL MODE ---
  if (mode === 'spell') {
    return (
        <div className="relative w-full max-w-xl h-auto min-h-[300px] sm:min-h-[360px] bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center p-6 mx-auto transition-all">
            {/* Top Info */}
            <div className="w-full flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                     <span className={`text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full ${data.type === CardType.WORD ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                        {data.type === CardType.WORD ? '单词' : '短语'}
                    </span>
                    {renderMemoryBars()}
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        type="button"
                        onClick={(e) => {
                            handleSpeak(e);
                            inputRef.current?.focus();
                        }}
                        className="text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-full transition-all"
                        title="播放发音"
                    >
                        <Volume2 size={20} />
                    </button>
                </div>
            </div>

            {/* Question (Chinese) */}
            <div className="flex-1 flex flex-col justify-center items-center w-full mb-8">
                {data.pos && (
                     <div className="text-gray-400 font-serif italic text-lg mb-2">{data.pos}</div>
                )}
                <h3 className="text-xl sm:text-2xl font-bold text-gray-800 text-center mb-6">
                    {data.back}
                </h3>

                {/* Input Area */}
                <form onSubmit={checkSpelling} className="w-full max-w-md relative">
                     <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                          setSpellStatus('idle');
                          setInputValue(e.target.value);
                        }}
                        disabled={spellStatus !== 'idle'}
                        placeholder="输入英文..."
                        className={`w-full text-center text-xl sm:text-2xl p-3 border rounded-lg outline-none transition-colors font-semibold ${
                            spellStatus === 'success' ? 'border-green-500 text-green-700 bg-green-50' :
                            spellStatus === 'error' ? 'border-red-500 text-red-700 bg-red-50 line-through' :
                            'border-gray-300 focus:border-indigo-500 text-gray-900 bg-white placeholder-gray-400'
                        }`}
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                     />
                     
                     {/* Feedback Icon / Button */}
                     <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {spellStatus === 'success' && <div className="text-green-500 animate-bounce"><CheckIcon /></div>}
                     </div>
                </form>

                 {/* Error Feedback & Correction */}
                {spellStatus === 'error' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 flex flex-col items-center"
                    >
                        <p className="text-red-500 text-sm font-semibold mb-1">正确答案是：</p>
                        <div className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2 select-text">
                            {data.front}
                            <button onClick={() => handleSpeak()} className="text-indigo-400 hover:text-indigo-600">
                                <Volume2 size={20} />
                            </button>
                        </div>
                        <button 
                            onClick={handleContinueAfterError}
                            className="flex items-center gap-2 px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                        >
                            继续 (记为忘记) <ArrowRight size={16} />
                        </button>
                    </motion.div>
                )}
            </div>
            
             <div className="absolute bottom-4 right-4 opacity-20">
                <Keyboard size={24} />
             </div>
        </div>
    );
  }

  // --- RENDER READ MODE (Original 3D Flip) ---
  return (
    <div 
      className="relative w-full max-w-xl h-64 sm:h-80 cursor-pointer perspective-1000 mx-auto"
      onClick={onFlip}
    >
      <motion.div
        className="relative w-full h-full transform-style-3d shadow-xl rounded-2xl"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* FRONT */}
        <div className="absolute w-full h-full backface-hidden bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center p-4 sm:p-8">
           <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className={`text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full ${data.type === CardType.WORD ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
              {data.type === CardType.WORD ? '单词' : '短语'}
            </span>
            {/* Memory Level Indicator on Front (Subtle) */}
            <div className="opacity-50 hover:opacity-100 transition-opacity">
               {renderMemoryBars()}
            </div>
          </div>
          
          <button 
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-full transition-all" 
            onClick={(e) => handleSpeak(e)}
            title="听发音"
          >
             <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {data.pos && (
            <p className="text-gray-400 font-serif italic text-lg mb-2">{data.pos}</p>
          )}

          {/* Responsive Text Size */}
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-800 text-center break-words px-2">
            {data.front}
          </h2>
          
          <p className="absolute bottom-4 sm:bottom-6 text-gray-400 text-xs sm:text-sm animate-pulse">
            点击或按空格键翻转
          </p>
        </div>

        {/* BACK */}
        <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-blue-100 flex flex-col items-center justify-center p-4 sm:p-8 rotate-y-180">
          <div className="absolute top-4 left-4">
            <span className="text-xs font-bold text-indigo-400">释义</span>
          </div>
          
          {data.pos && (
             <p className="text-indigo-400 font-serif italic text-lg mb-2 opacity-80">{data.pos}</p>
          )}

          <h3 className="text-xl sm:text-3xl font-bold text-indigo-900 text-center leading-relaxed mb-6 px-2">
            {data.back}
          </h3>
          
          {/* Detailed Ebbinghaus Status on Back */}
          <div className="absolute bottom-4 sm:bottom-6 flex flex-col items-center gap-2 w-full px-4 sm:px-8">
            <div className="w-full h-px bg-indigo-100 mb-2"></div>
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
               <span className="text-[10px] sm:text-xs text-gray-400">艾宾浩斯记忆状态:</span>
               <div className={`flex items-center gap-1.5 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium shadow-sm border border-white/50 ${status.color}`}>
                  {status.icon}
                  <span>{status.label}</span>
               </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// Simple check icon for the mastered state
const CheckIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export default Flashcard;