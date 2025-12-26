import React from 'react';
import { motion } from 'framer-motion';
import { FlashcardData, CardType } from '../types';
import { RotateCcw, Volume2 } from 'lucide-react';

interface FlashcardProps {
  data: FlashcardData;
  isFlipped: boolean;
  onFlip: () => void;
}

const Flashcard: React.FC<FlashcardProps> = ({ data, isFlipped, onFlip }) => {
  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(data.front);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div 
      className="relative w-full max-w-xl h-80 cursor-pointer perspective-1000 mx-auto"
      onClick={onFlip}
    >
      <motion.div
        className="relative w-full h-full transform-style-3d shadow-xl rounded-2xl"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* FRONT */}
        <div className="absolute w-full h-full backface-hidden bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center p-8">
           <div className="absolute top-4 left-4">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${data.type === CardType.WORD ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
              {data.type === CardType.WORD ? 'WORD' : 'PHRASE'}
            </span>
          </div>
          
          <button 
            className="absolute top-4 right-4 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-full transition-all" 
            onClick={handleSpeak}
            title="Listen"
          >
             <Volume2 size={24} />
          </button>

          <h2 className="text-4xl font-bold text-gray-800 text-center">{data.front}</h2>
          {data.pos && (
            <p className="mt-4 text-gray-500 font-medium italic">{data.pos}</p>
          )}
          <p className="absolute bottom-6 text-gray-400 text-sm animate-pulse">
            Press Space to Flip
          </p>
        </div>

        {/* BACK */}
        <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-blue-100 flex flex-col items-center justify-center p-8 rotate-y-180">
          <div className="absolute top-4 left-4">
            <span className="text-xs font-bold text-indigo-400">MEANING</span>
          </div>
          
          <h3 className="text-3xl font-bold text-indigo-900 text-center leading-relaxed">
            {data.back}
          </h3>
          
          {data.level > 0 && (
            <div className="absolute bottom-6 flex items-center gap-2 text-indigo-400 text-xs">
              <RotateCcw size={14} />
              <span>Current Streak: {data.level}</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Flashcard;